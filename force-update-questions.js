const valkeyClient = require('./valkey-client');
const { questionPreloader } = require('./question-preloader');

async function forceUpdateQuestions() {
    try {
        const weekKey = questionPreloader.getWeekKey();
        console.log(`Clearing existing questions for week: ${weekKey}`);
        
        await valkeyClient.deleteWeeklyQuestions(weekKey);
        console.log('Cache cleared, fetching new easy/medium questions...');
        
        const result = await questionPreloader.preloadWeeklyQuestions();
        return result;
    } catch (error) {
        console.error('Force update failed:', error.message);
        return { success: false, error: error.message };
    }
}

exports.handler = async (event, context) => {
    const result = await forceUpdateQuestions();
    return {
        statusCode: result.success ? 200 : 500,
        body: JSON.stringify(result)
    };
};