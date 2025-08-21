// Security headers middleware for production deployment
// Implements OWASP security best practices
const securityHeaders = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Note: unsafe-inline used for compatibility with inline frontend scripts
    // In production, consider moving to external JS/CSS files with nonces
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
};

/**
 * Adds security headers to HTTP response
 * @param {Object} headers - Existing headers object
 * @returns {Object} Headers with security headers added
 */
function addSecurityHeaders(headers = {}) {
    if (!headers || typeof headers !== 'object') {
        headers = {};
    }
    return { ...headers, ...securityHeaders };
}

module.exports = { addSecurityHeaders };