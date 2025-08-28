const valkeyClient = require('./valkey-client');

async function clearCurrentLeaderboard() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const week = getWeekNumber(now);
        const weekKey = `${year}-${week}`;
        
        const client = await valkeyClient.connect();
        const key = `valkey:leaderboard:${weekKey}`;
        
        await client.del(key);
        console.log(`Cleared leaderboard for week ${weekKey}`);
        
        return { success: true, weekKey };
    } catch (error) {
        console.error('Failed to clear leaderboard:', error.message);
        return { success: false, error: error.message };
    }
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

exports.handler = async (event, context) => {
    const result = await clearCurrentLeaderboard();
    return {
        statusCode: result.success ? 200 : 500,
        body: JSON.stringify(result)
    };
};

if (require.main === module) {
    clearCurrentLeaderboard().then(console.log);
}