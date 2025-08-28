const { v4: uuidv4 } = require('uuid');
const valkeyClient = require('./valkey-client');
const questionService = require('./question-service');

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
        let body = {};
        
        if (event.body) {
            try {
                body = JSON.parse(event.body);
            } catch (e) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Invalid JSON' })
                };
            }
        }

        switch (`${method} ${path}`) {
            case 'POST /start-game':
                return await startGame(body.category || 'general', headers);
            case 'POST /submit-answer':
                return await submitAnswer(body, headers);
            case 'GET /leaderboard':
                return await getLeaderboard(headers);
            case 'POST /end-session':
                return await endSession(body.sessionId, headers);
            default:
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Endpoint not found' })
                };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

async function startGame(category, headers) {
    try {
        const sessionId = uuidv4();
        const questions = await questionService.getGameQuestions('user123', category);
        
        if (!questions || questions.length === 0) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'No questions available' })
            };
        }
        
        const sessionData = {
            sessionId,
            questions: questions.map(q => ({
                id: q.id || Math.random().toString(),
                question: q.question,
                options: shuffleOptions([q.correct_answer, ...q.incorrect_answers]),
                correct_answer: q.correct_answer
            })),
            currentQuestion: 0,
            score: 0,
            startTime: Date.now()
        };
        
        await valkeyClient.createSession(sessionId, sessionData);
        
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
    } catch (error) {
        console.error('Start game error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to start game: ' + error.message })
        };
    }
}

async function submitAnswer(requestData, headers) {
    try {
        const { sessionId, questionId, answer, timeTaken } = requestData;
        
        if (!sessionId || !answer) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }
        
        const session = await valkeyClient.getSession(sessionId);
        
        if (!session) {
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
            const validTimeTaken = Math.max(0, Math.min(30, Number(timeTaken) || 0));
            questionScore = 10 + Math.max(0, 5 - validTimeTaken);
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
        
        await valkeyClient.updateSession(sessionId, session);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.error('Submit answer error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to submit answer: ' + error.message })
        };
    }
}

async function endSession(sessionId, headers) {
    try {
        const session = await valkeyClient.getSession(sessionId);
        
        if (!session) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid session' })
            };
        }
        
        await valkeyClient.addToLeaderboard(session.score, 'user123', 'Player');
        await valkeyClient.deleteSession(sessionId);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                finalScore: session.score,
                message: 'Session completed successfully'
            })
        };
    } catch (error) {
        console.error('End session error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to end session: ' + error.message })
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
        console.error('Get leaderboard error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to get leaderboard', leaderboard: [] })
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