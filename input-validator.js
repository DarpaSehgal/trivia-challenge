// Input validation and sanitization utilities
function sanitizeString(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[\r\n\t]/g, ' ').trim().substring(0, 1000);
}

function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    
    const sanitized = sanitizeString(username);
    if (sanitized.length < 2 || sanitized.length > 20) {
        return { valid: false, error: 'Username must be 2-20 characters' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
        return { valid: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' };
    }
    
    return { valid: true, sanitized };
}

function validateSessionData(data) {
    const errors = [];
    
    if (!data.sessionId || typeof data.sessionId !== 'string') {
        errors.push('Invalid session ID');
    }
    
    if (data.timeTaken !== undefined && (typeof data.timeTaken !== 'number' || data.timeTaken < 0 || data.timeTaken > 60)) {
        errors.push('Invalid time taken');
    }
    
    return { valid: errors.length === 0, errors };
}

function parseJsonSafely(jsonString) {
    try {
        return { success: true, data: JSON.parse(jsonString) };
    } catch (error) {
        return { success: false, error: 'Invalid JSON format' };
    }
}

module.exports = {
    sanitizeString,
    validateUsername,
    validateSessionData,
    parseJsonSafely
};