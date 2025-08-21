const valkeyClient = require('./valkey-client');

async function healthCheck() {
    const checks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        checks: {}
    };

    // Check Valkey connection
    try {
        const startTime = Date.now();
        await valkeyClient.ping();
        const latency = Date.now() - startTime;
        checks.checks.valkey = { status: 'healthy', latency: `${latency}ms` };
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