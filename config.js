module.exports = {
    VALKEY_HOST: process.env.VALKEY_HOST || 'localhost',
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    SESSION_TTL: 3600,
    QUESTIONS_PER_GAME: 5,
    MAX_SCORE_PER_QUESTION: 15
};