const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
    jwksUri: `https://cognito-idp.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}
const valkeyClient = require('./valkey-client');
const questionService = require('./question-service');
const { addSecurityHeaders } = require('./security-headers');
const { healthCheck } = require('./health-check');
const config = require('./config');
const { validateUsername, validateSessionData, parseJsonSafely, sanitizeString } = require('./input-validator');

// Rate limiting with configuration
const rateLimiter = new Map();
const RATE_LIMIT = config.rateLimit;
const RATE_WINDOW = config.rateLimitWindow;

function checkRateLimit(userId) {
    const now = Date.now();
    const userRequests = rateLimiter.get(userId) || [];
    
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => now - time < RATE_WINDOW);
    
    if (recentRequests.length >= RATE_LIMIT) {
        return false;
    }
    
    recentRequests.push(now);
    rateLimiter.set(userId, recentRequests);
    return true;
}

exports.handler = async (event) => {
    const baseHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
    const headers = addSecurityHeaders(baseHeaders);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const path = event.path;
        const method = event.httpMethod;
        let body = {};
        if (event.body) {
            const parseResult = parseJsonSafely(event.body);
            if (!parseResult.success) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Invalid request format' })
                };
            }
            body = parseResult.data;
        }
        const userId = extractUserId(event);
        
        // Rate limiting
        if (!checkRateLimit(userId)) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({ error: 'Rate limit exceeded' })
            };
        }

        switch (`${method} ${path}`) {
            case 'GET /health':
                return await handleHealthCheck(headers);
            case 'POST /validate-username':
                return await validateUsernameEndpoint(body.username, headers);
            case 'POST /check-username':
                return await checkUsernameUniqueness(body.username, headers);
            case 'POST /start-game':
                return await startGame(userId, body.category, headers);
            case 'POST /submit-answer':
                return await submitAnswer(userId, body, headers);
            case 'GET /leaderboard':
                return await getLeaderboard(headers);
            case 'POST /end-session':
                return await endSession(userId, body.sessionId, headers);
            default:
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Endpoint not found' })
                };
        }
    } catch (error) {
        console.error('Error:', error);
        // Log error details for monitoring
        console.error('Request details:', {
            path: event.path,
            method: event.httpMethod,
            userId: extractUserId(event),
            timestamp: new Date().toISOString()
        });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

function extractUserId(event) {
    try {
        const token = event.headers.Authorization?.replace('Bearer ', '') || event.headers.authorization?.replace('Bearer ', '');
        if (!token) return 'anonymous';
        
        // For production, verify the JWT
        try {
            const decoded = jwt.verify(token, getKey, {
                audience: process.env.COGNITO_CLIENT_ID,
                issuer: `https://cognito-idp.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
                algorithms: ['RS256']
            });
            return decoded.sub || decoded['cognito:username'] || 'anonymous';
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            // Fallback to decode for development
            const decoded = jwt.decode(token);
            return decoded?.sub || decoded?.['cognito:username'] || 'anonymous';
        }
    } catch (error) {
        console.error('Token extraction error:', error);
        return 'anonymous';
    }
}

async function validateUsernameEndpoint(username, headers) {
    const validation = validateUsername(username);
    return {
        statusCode: validation.valid ? 200 : 400,
        headers,
        body: JSON.stringify(validation.valid ? { valid: true } : { valid: false, error: validation.error })
    };
}

async function checkUsernameUniqueness(username, headers) {
    const validation = validateUsername(username);
    if (!validation.valid) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ available: false, error: validation.error })
        };
    }
    
    try {
        const isAvailable = await valkeyClient.isUsernameAvailable(validation.sanitized);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ available: isAvailable })
        };
    } catch (error) {
        console.error('Username check failed:', error);
        // Fallback validation
        const reservedUsernames = ['admin', 'test', 'user', 'root', 'administrator', 'support', 'help', 'api', 'www', 'mail', 'ftp'];
        const isReserved = reservedUsernames.includes(username.toLowerCase());
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ available: !isReserved })
        };
    }
}

async function startGame(userId, category = 'general', headers) {
    const sessionId = uuidv4();
    const questions = await questionService.getGameQuestions(userId, category);
    
    // Mark questions as seen (with error handling)
    try {
        for (const question of questions) {
            await valkeyClient.addSeenQuestion(userId, question.id);
        }
    } catch (error) {
        console.error('Failed to mark questions as seen:', error);
    }
    
    const sessionData = {
        userId,
        sessionId,
        questions: questions.map(q => ({
            id: q.id,
            question: q.question,
            options: shuffleOptions([q.correct_answer, ...q.incorrect_answers]),
            correct_answer: q.correct_answer
        })),
        currentQuestion: 0,
        score: 0,
        startTime: Date.now()
    };
    
    try {
        await valkeyClient.createSession(sessionId, sessionData);
    } catch (error) {
        console.error('Failed to create session in Valkey, using in-memory:', error);
        // Store in memory as fallback (this is temporary for this session)
        global.sessions = global.sessions || {};
        global.sessions[sessionId] = sessionData;
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            sessionId,
            question: sessionData.questions[0],
            questionNumber: 1,
            totalQuestions: 5
        })
    };
}

async function submitAnswer(userId, requestData, headers) {
    const validation = validateSessionData(requestData);
    if (!validation.valid) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: validation.errors.join(', ') })
        };
    }
    
    const { sessionId, questionId, answer, timeTaken } = requestData;
    
    if (!questionId || answer === undefined) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing required fields' })
        };
    }
    let session;
    try {
        session = await valkeyClient.getSession(sessionId);
    } catch (error) {
        console.error('Failed to get session from Valkey, checking memory:', error);
        session = global.sessions?.[sessionId];
    }
    
    if (!session || session.userId !== userId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session' })
        };
    }
    
    if (session.currentQuestion >= session.questions.length) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid question index' })
        };
    }
    
    const currentQ = session.questions[session.currentQuestion];
    const isCorrect = answer === currentQ.correct_answer;
    
    let questionScore = 0;
    if (isCorrect) {
        questionScore = 10 + Math.max(0, 5 - timeTaken);
        session.score += questionScore;
    }
    
    session.currentQuestion++;
    
    const response = {
        correct: isCorrect,
        correctAnswer: currentQ.correct_answer,
        score: questionScore,
        totalScore: session.score
    };
    
    if (session.currentQuestion < session.questions.length) {
        response.nextQuestion = session.questions[session.currentQuestion];
        response.questionNumber = session.currentQuestion + 1;
        response.totalQuestions = 5;
    } else {
        response.gameComplete = true;
    }
    
    try {
        await valkeyClient.updateSession(sessionId, session);
    } catch (error) {
        console.error('Failed to update session in Valkey, updating memory:', error);
        if (global.sessions) {
            global.sessions[sessionId] = session;
        }
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
    };
}

async function endSession(userId, sessionId, headers) {
    let session;
    try {
        session = await valkeyClient.getSession(sessionId);
    } catch (error) {
        console.error('Failed to get session from Valkey, checking memory:', error);
        session = global.sessions?.[sessionId];
    }
    
    if (!session || session.userId !== userId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session' })
        };
    }
    
    // Add to leaderboard and store username
    const username = session.username || (userId.includes('@') ? userId.split('@')[0] : userId) || 'anonymous';
    try {
        await valkeyClient.addToLeaderboard(session.score, userId, username);
        await valkeyClient.storeUsername(username, userId);
        
        // Clean up session after completion
        await valkeyClient.deleteSession(sessionId);
        if (global.sessions && global.sessions[sessionId]) {
            delete global.sessions[sessionId];
        }
    } catch (error) {
        console.error('Failed to update leaderboard:', error);
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            finalScore: session.score,
            message: 'Session completed successfully'
        })
    };
}

async function getLeaderboard(headers) {
    try {
        const leaderboard = await valkeyClient.getLeaderboard();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ leaderboard })
        };
    } catch (error) {
        console.error('Failed to get leaderboard:', error);
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Leaderboard temporarily unavailable', leaderboard: [] })
        };
    }
}

async function handleHealthCheck(headers) {
    try {
        const health = await healthCheck();
        return {
            statusCode: health.status === 'healthy' ? 200 : 503,
            headers,
            body: JSON.stringify(health)
        };
    } catch (error) {
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
}

function shuffleOptions(options) {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
