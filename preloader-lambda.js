const questionPreloader = require('./question-preloader');

exports.handler = async (event) => {
    console.log('Weekly question preloader started');
    
    try {
        const result = await questionPreloader.preloadWeeklyQuestions();
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Weekly question preload completed',
                ...result
            })
        };
    } catch (error) {
        console.error('Preloader failed:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Weekly question preload failed',
                error: error.message
            })
        };
    }
};