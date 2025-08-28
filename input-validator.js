const RESERVED_USERNAMES = [
    'admin', 'administrator', 'root', 'system', 'test', 'user', 'guest',
    'null', 'undefined', 'anonymous', 'bot', 'api', 'service'
];

function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    
    if (username.length < 3 || username.length > 20) {
        return { valid: false, error: 'Username must be 3-20 characters' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers, underscore, and dash' };
    }
    
    if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
        return { valid: false, error: 'Username is reserved' };
    }
    
    return { valid: true, sanitized: username.toLowerCase() };
}

function validateSessionData(data) {
    const errors = [];
    
    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Invalid request data'] };
    }
    
    if (!data.sessionId || typeof data.sessionId !== 'string' || data.sessionId.length > 100) {
        errors.push('Invalid session ID');
    }
    
    if (!data.questionId || typeof data.questionId !== 'string' || data.questionId.length > 100) {
        errors.push('Invalid question ID');
    }
    
    if (data.answer === undefined || data.answer === null || typeof data.answer !== 'string' || data.answer.length > 500) {
        errors.push('Invalid answer');
    }
    
    if (typeof data.timeTaken !== 'number' || data.timeTaken < 0 || data.timeTaken > 300) {
        errors.push('Invalid time taken');
    }
    
    return { valid: errors.length === 0, errors };
}

function parseJsonSafely(jsonString) {
    try {
        if (!jsonString || typeof jsonString !== 'string') {
            return { success: false, error: 'Invalid JSON string' };
        }
        
        if (jsonString.length > 10000) {
            return { success: false, error: 'JSON too large' };
        }
        
        const data = JSON.parse(jsonString);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: 'Invalid JSON format' };
    }
}

function sanitizeString(input, maxLength = 100) {
    if (!input || typeof input !== 'string') {
        return '';
    }
    
    return input
        .replace(/[<>\"'&\x00-\x1f\x7f-\x9f]/g, '')
        .substring(0, maxLength)
        .trim();
}

module.exports = {
    validateUsername,
    validateSessionData,
    parseJsonSafely,
    sanitizeString,
    RESERVED_USERNAMES
};