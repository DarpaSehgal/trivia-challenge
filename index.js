const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
// Force deployment trigger - retry
const { requireAuth, extractUserId } = require('./auth-middleware');
const valkeyClient = require('./valkey-client');
const questionService = require('./question-service');
const { addSecurityHeaders } = require('./security-headers');
const { healthCheck } = require('./health-check');
const config = require('./config');
const { validateUsername, validateSessionData, parseJsonSafely, sanitizeString } = require('./input-validator');
const rateLimiter = require('./rate-limiter');

const RESERVED_USERNAMES = ['admin', 'root', 'system', 'test', 'guest', 'anonymous', 'null', 'undefined'];

function sanitizeLogValue(value) {
    return String(value || '').replace(/[\r\n\t\x00-\x1f\x7f-\x9f<>"'&]/g, ' ').substring(0, 200);
}

function validateQuestionId(questionId) {
    if (!questionId || typeof questionId !== 'string') {
        return false;
    }
    
    if (questionId.length > 100 || questionId.length < 5) {
        return false;
    }
    
    const maliciousPatterns = [
        /<script/i, /javascript:/i, /on\w+=/i, /\$\{/, /\$\(/, /eval\(/i, /function\(/i
    ];
    
    if (maliciousPatterns.some(pattern => pattern.test(questionId))) {
        return false;
    }
    
    const validFormats = [
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
        /^mixed_\d+_[a-z0-9]+_\d+$/i,
        /^mock_\d+$/i
    ];
    
    return validFormats.some(format => format.test(questionId));
}

function validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
        return false;
    }
    return !/[<>"'&\$\{\$\(]/.test(sessionId);
}

function validateAnswer(answer) {
    if (answer === undefined || answer === null || typeof answer !== 'string') {
        return false;
    }
    // Allow empty string for timeouts
    return answer.length <= 500 && !/[<>"'&\$\{\$\(]/.test(answer);
}

function isValidTimeTaken(timeTaken) {
    if (typeof timeTaken !== 'number' || timeTaken < 0 || timeTaken > 300) {
        return false;
    }
    return true;
}

const TOTAL_QUESTIONS = 5;

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
        let userId = null;
        try {
            userId = extractUserId(event);
            if (userId && (typeof userId !== 'string' || userId.length > 100 || !/^[a-zA-Z0-9\-_@.]+$/.test(userId))) {
                console.warn('Invalid user ID format detected');
                userId = null;
            }
        } catch (error) {
            console.warn('User ID extraction failed:', sanitizeLogValue(error.message));
            userId = null;
        }
        
        // Rate limiting with IP fallback for unauthenticated users
        const rateLimitKey = userId || event.requestContext?.identity?.sourceIp || 'anonymous';
        if (!rateLimiter.checkRateLimit(rateLimitKey)) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({ error: 'Rate limit exceeded' })
            };
        }

        // Protected endpoints require authentication
        const protectedEndpoints = ['/start-game', '/submit-answer', '/end-session'];
        const isProtected = protectedEndpoints.some(endpoint => path === endpoint);
        
        if (isProtected) {
            try {
                await requireAuth(event);
            } catch (authError) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: 'Unauthorized' })
                };
            }
        }

        switch (`${method} ${path}`) {
            case 'GET /health':
                return await handleHealthCheck(headers);
            case 'POST /validate-username':
                if (!body.username) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username is required' }) };
                }
                return await validateUsernameEndpoint(body.username, headers);
            case 'POST /check-username':
                if (!body.username) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Username is required' }) };
                }
                return await checkUsernameUniqueness(body.username, headers);
            case 'POST /start-game':
                return await startGame(userId, body.category, headers);
            case 'POST /submit-answer':
                return await submitAnswer(userId, body, headers);
            case 'GET /leaderboard':
                return await getLeaderboard(headers);
            case 'POST /clear-leaderboard':
                return await clearLeaderboard(headers);
            case 'POST /end-session':
                return await endSession(userId, body.sessionId, headers, event);
            default:
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Endpoint not found' })
                };
        }
    } catch (error) {
        console.error('Error:', sanitizeLogValue(error.message));
        // Log error details for monitoring
        console.error('Request details:', {
            path: sanitizeLogValue(event.path),
            method: sanitizeLogValue(event.httpMethod),
            userId: (() => {
                try {
                    return sanitizeLogValue(extractUserId(event));
                } catch {
                    return 'unknown';
                }
            })(),
            timestamp: new Date().toISOString()
        });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};



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
        const AWS = require('aws-sdk');
        const cognito = new AWS.CognitoIdentityServiceProvider();
        
        const params = {
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            AttributesToGet: ['preferred_username'],
            Filter: `preferred_username = "${validation.sanitized}"`
        };
        
        const result = await cognito.listUsers(params).promise();
        const isAvailable = result.Users.length === 0;
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ available: isAvailable })
        };
    } catch (error) {
        console.error('Username check failed:', sanitizeLogValue(error.message));
        // Fallback validation - assume unavailable on error for security
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ available: false, error: 'Username availability check failed' })
        };
    }
}

async function startGame(userId, category = 'general', headers) {
    const validCategories = ['general', 'science', 'history', 'sports', 'entertainment'];
    if (category) {
        if (typeof category !== 'string' || category.length > 50) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid category format' })
            };
        }
        
        if (/<|>|script|javascript|eval|function/i.test(category)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid category content' })
            };
        }
        
        if (!validCategories.includes(category.toLowerCase())) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Unsupported category' })
            };
        }
    }
    const sessionId = uuidv4();
    let questions;
    try {
        questions = await questionService.getGameQuestions(userId, category);
    } catch (error) {
        console.error('Failed to get questions:', sanitizeLogValue(error.message));
        throw new Error('Question service unavailable');
    }
    
    // Mark questions as seen (batch operation)
    try {
        await valkeyClient.addSeenQuestions(userId, questions.map(q => q.id));
    } catch (error) {
        console.error('Failed to mark questions as seen:', sanitizeLogValue(error.message));
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
        console.error('Failed to create session in Valkey:', sanitizeLogValue(error.message));
        // Return error instead of using global memory
        throw new Error('Session storage unavailable');
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            sessionId,
            question: sessionData.questions[0],
            questionNumber: 1,
            totalQuestions: TOTAL_QUESTIONS
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
    
    if (!validateSessionId(sessionId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session ID' })
        };
    }
    
    if (!validateQuestionId(questionId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid question ID' })
        };
    }
    
    if (!validateAnswer(answer)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid answer format' })
        };
    }
    
    if (!isValidTimeTaken(timeTaken)) {
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
        console.error('Failed to get session from Valkey:', sanitizeLogValue(error.message));
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Session storage unavailable' })
        };
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
    
    const currentQuestion = session.questions[session.currentQuestion];
    
    // Validate questionId matches current question
    if (questionId && questionId !== currentQuestion.id) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Question ID does not match current question' })
        };
    }
    
    const isCorrect = answer === currentQuestion.correct_answer;
    
    let questionScore = 0;
    if (isCorrect) {
        const validTimeTaken = normalizeTimeTaken(timeTaken);
        // Base 10 points + speed bonus for answers within 10 seconds
        // 1-10s: bonus points, 11-15s: only base 10 points
        const speedBonus = validTimeTaken <= 10 ? Math.max(0, Math.floor(10 - validTimeTaken)) : 0;
        questionScore = 10 + speedBonus;
        session.score += questionScore;
    }
    
    session.currentQuestion++;
    
    const response = {
        correct: isCorrect,
        correctAnswer: currentQuestion.correct_answer,
        score: questionScore,
        totalScore: session.score
    };
    
    if (session.currentQuestion < session.questions.length) {
        response.nextQuestion = session.questions[session.currentQuestion];
        response.questionNumber = session.currentQuestion + 1;
        response.totalQuestions = TOTAL_QUESTIONS;
    } else {
        response.gameComplete = true;
    }
    
    try {
        await valkeyClient.updateSession(sessionId, session);
    } catch (error) {
        console.error('Failed to update session in Valkey:', sanitizeLogValue(error.message));
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Session update failed' })
        };
    }
    
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
    };
}

async function endSession(userId, sessionId, headers, event) {
    if (!validateSessionId(sessionId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session ID' })
        };
    }
    let session;
    try {
        session = await valkeyClient.getSession(sessionId);
    } catch (error) {
        console.error('Failed to get session from Valkey:', sanitizeLogValue(error.message));
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Session storage unavailable' })
        };
    }
    
    if (!session || session.userId !== userId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid session' })
        };
    }
    
    // Get username from JWT token
    let username = 'Player';
    try {
        const authHeader = event?.headers?.Authorization || event?.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.decode(token);
            // Try multiple fields to get the username
            username = decoded?.preferred_username || 
                      decoded?.['cognito:username'] || 
                      decoded?.username || 
                      (decoded?.email ? decoded.email.split('@')[0] : null) || 
                      'Player';
        }
    } catch (error) {
        console.error('Error extracting username:', sanitizeLogValue(error.message));
        username = 'Player';
    }
    
    try {
        // Ensure session cleanup happens regardless of leaderboard operation success
        try {
            const [leaderboardResult] = await Promise.all([
                valkeyClient.addToLeaderboard(session.score, userId, username),
                valkeyClient.storeUsername(username, userId)
            ]);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    finalScore: session.score,
                    newBest: leaderboardResult?.newBest || false,
                    message: 'Session completed successfully'
                })
            };
        } finally {
            await valkeyClient.deleteSession(sessionId);
        }
    } catch (error) {
        console.error('Failed to update leaderboard:', sanitizeLogValue(error.message));
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to record score', 
                finalScore: session.score,
                message: 'Session completed but score recording failed'
            })
        };
    }
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
        console.error('Failed to get leaderboard:', sanitizeLogValue(error.message));
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Leaderboard temporarily unavailable', leaderboard: [] })
        };
    }
}

async function clearLeaderboard(headers) {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const week = getWeekNumber(now);
        const weekKey = `${year}-${week}`;
        
        const client = await valkeyClient.connect();
        const key = `valkey:leaderboard:${weekKey}`;
        
        await client.del(key);
        console.log(`Cleared leaderboard for week ${weekKey}`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: `Leaderboard cleared for week ${weekKey}` })
        };
    } catch (error) {
        console.error('Failed to clear leaderboard:', sanitizeLogValue(error.message));
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to clear leaderboard' })
        };
    }
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
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
                error: sanitizeLogValue(error.message),
                timestamp: new Date().toISOString()
            })
        };
    }
}

function deriveUsername(session, userId) {
    if (!userId || typeof userId !== 'string') return 'Player';
    // If userId looks like an email, extract username part
    if (userId.includes('@')) {
        return userId.split('@')[0];
    }
    // If userId is a UUID, return generic name
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/.test(userId)) {
        return 'Player';
    }
    return session.username || userId || 'Player';
}

function normalizeTimeTaken(timeTaken) {
    return (typeof timeTaken === 'number' && timeTaken > 0 && timeTaken <= 15) ? timeTaken : 15;
}

function shuffleOptions(options) {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
