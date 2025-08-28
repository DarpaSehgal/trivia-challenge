const jwt = require('jsonwebtoken');

function sanitizeLogValue(value) {
    return String(value || '').replace(/[\r\n\t\x00-\x1f\x7f-\x9f<>"'&]/g, ' ').substring(0, 200);
}

function extractUserId(event) {
    try {
        if (!event || typeof event !== 'object') {
            throw new Error('Invalid event object');
        }
        
        const headers = event.headers || {};
        const authHeader = headers.Authorization || headers.authorization;
        
        if (!authHeader || typeof authHeader !== 'string') {
            throw new Error('Missing authorization header');
        }
        
        if (!authHeader.startsWith('Bearer ')) {
            throw new Error('Invalid authorization format');
        }
        
        const token = authHeader.substring(7).trim();
        if (!token || token.length < 10) {
            throw new Error('Invalid token format');
        }
        
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT structure');
        }
        
        const decoded = jwt.decode(token);
        
        if (!decoded || typeof decoded !== 'object') {
            throw new Error('Invalid token payload');
        }
        
        if (!decoded.sub || typeof decoded.sub !== 'string') {
            throw new Error('Missing or invalid user ID in token');
        }
        
        if (decoded.sub.length > 100 || !/^[a-zA-Z0-9\-_]+$/.test(decoded.sub)) {
            throw new Error('Invalid user ID format');
        }
        
        return decoded.sub;
    } catch (error) {
        console.error('Authentication error:', sanitizeLogValue(error.message));
        throw new Error('Authentication failed');
    }
}

async function requireAuth(event) {
    const userId = extractUserId(event);
    if (!userId) {
        throw new Error('Authentication required');
    }
    return userId;
}

module.exports = {
    extractUserId,
    requireAuth
};