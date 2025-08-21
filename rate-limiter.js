const config = require('./config');

class RateLimiter {
    constructor() {
        this.requests = new Map();
        this.maxSize = 10000;
        this.lastCleanup = Date.now();
        this.cleanupThreshold = 60000; // 1 minute
    }

    checkRateLimit(userId) {
        const now = Date.now();
        
        // Trigger cleanup if needed (no persistent timers)
        if (now - this.lastCleanup > this.cleanupThreshold) {
            this.cleanup();
            this.lastCleanup = now;
        }
        
        const userRequests = this.requests.get(userId) || [];
        const cutoff = now - config.rateLimitWindow;
        
        // Use binary search for efficient removal
        let validStart = 0;
        for (let i = 0; i < userRequests.length; i++) {
            if (userRequests[i] > cutoff) {
                validStart = i;
                break;
            }
        }
        
        const recentRequests = userRequests.slice(validStart);
        
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
}

module.exports = new RateLimiter();