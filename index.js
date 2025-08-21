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

// Simple in-memory rate limiting (production should use Redis)
const rateLimiter = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

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
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const path = event.path;
        const method = event.httpMethod;
        const body = event.body ? JSON.parse(event.body) : {};
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
            case 'POST /validate-username':
                return await validateUsername(body.username, headers);
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

async function validateUsername(username, headers) {
    if (!username || username.trim().length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ valid: false, error: 'Username cannot be empty' })
        };
    }
    
    if (username.length < 2 || username.length > 20) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ valid: false, error: 'Username must be between 2 and 20 characters' })
        };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ valid: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' })
        };
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: true })
    };
}

async function checkUsernameUniqueness(username, headers) {
    if (!username || username.trim().length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ available: false, error: 'Username cannot be empty' })
        };
    }
    
    if (username.length < 2 || username.length > 20) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ available: false, error: 'Username must be 2-20 characters long' })
        };
    }
    
    // Input sanitization
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ available: false, error: 'Invalid characters in username' })
        };
    }
    
    try {
        const isAvailable = await valkeyClient.isUsernameAvailable(username);
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

async function submitAnswer(userId, { sessionId, questionId, answer, timeTaken }, headers) {
    // Input validation
    if (!sessionId || !questionId || answer === undefined || timeTaken === undefined) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing required fields' })
        };
    }
    
    if (timeTaken < 0 || timeTaken > 60) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid time taken' })
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
    const session = await valkeyClient.getSession(sessionId);
    if (!session || session.userId !== userId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session' })
        };
    }
    
    // Add to leaderboard and store username
    const username = session.username || userId.split('@')[0] || userId;
    await valkeyClient.addToLeaderboard(session.score, userId, username);
    await valkeyClient.storeUsername(username, userId);
    
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
    const leaderboard = await valkeyClient.getLeaderboard();
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ leaderboard })
    };
}

function shuffleOptions(options) {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
