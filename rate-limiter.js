const config = require('./config');

class RateLimiter {
    constructor() {
        this.requests = new Map();
        this.maxSize = 10000; // Prevent memory leak
        this.cleanupInterval = 60000; // 1 minute
        this.startCleanup();
    }

    checkRateLimit(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        
        // Remove old requests outside the window
        const recentRequests = userRequests.filter(time => now - time < config.rateLimitWindow);
        
        if (recentRequests.length >= config.rateLimit) {
            return false;
        }
        
        recentRequests.push(now);
        this.requests.set(userId, recentRequests);
        
        // Prevent memory leak
        if (this.requests.size > this.maxSize) {
            this.cleanup();
        }
        
        return true;
    }

    cleanup() {
        const now = Date.now();
        const cutoff = now - config.rateLimitWindow;
        
        for (const [userId, requests] of this.requests.entries()) {
            const validRequests = requests.filter(time => time > cutoff);
            if (validRequests.length === 0) {
                this.requests.delete(userId);
            } else {
                this.requests.set(userId, validRequests);
            }
        }
    }

    startCleanup() {
        setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }
}

module.exports = new RateLimiter();