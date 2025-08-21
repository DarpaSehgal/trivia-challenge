const config = {
    production: {
        rateLimit: 100,
        rateLimitWindow: 60000,
        sessionTimeout: 1800000, // 30 minutes
        questionCacheTTL: 21600, // 6 hours
        maxRetries: 3,
        timeout: 5000,
        logLevel: 'error'
    },
    development: {
        rateLimit: 1000,
        rateLimitWindow: 60000,
        sessionTimeout: 3600000, // 1 hour
        questionCacheTTL: 3600, // 1 hour
        maxRetries: 1,
        timeout: 10000,
        logLevel: 'debug'
    }
};

const env = process.env.NODE_ENV || 'production';
module.exports = config[env];