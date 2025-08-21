const valkeyClient = require('./valkey-client');

async function healthCheck() {
    const checks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        checks: {}
    };

    // Check Valkey connection
    try {
        await valkeyClient.ping();
        checks.checks.valkey = { status: 'healthy', latency: Date.now() };
    } catch (error) {
        checks.checks.valkey = { status: 'unhealthy', error: error.message };
        checks.status = 'unhealthy';
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.checks.memory = {
        status: memUsage.heapUsed < 100 * 1024 * 1024 ? 'healthy' : 'warning',
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    };

    return checks;
}

module.exports = { healthCheck };