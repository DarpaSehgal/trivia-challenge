const valkeyClient = require('./valkey-client');

async function healthCheck() {
    try {
        const startTime = Date.now();
        await valkeyClient.ping();
        const responseTime = Date.now() - startTime;
        
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                valkey: {
                    status: 'healthy',
                    responseTime: `${responseTime}ms`
                }
            }
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            services: {
                valkey: {
                    status: 'unhealthy',
                    error: error.message
                }
            }
        };
    }
}

module.exports = {
    healthCheck
};