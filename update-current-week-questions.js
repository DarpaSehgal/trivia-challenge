const { questionPreloader } = require('./question-preloader');

async function updateCurrentWeekQuestions() {
    console.log('Updating current week questions to easy/medium difficulty only...');
    
    try {
        const result = await questionPreloader.preloadWeeklyQuestions();
        
        if (result.success) {
            console.log(`Successfully updated ${result.questionsLoaded} questions for week ${result.weekKey}`);
        } else {
            console.error('Failed to update questions:', result.error);
        }
        
        return result;
    } catch (error) {
        console.error('Update failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Run if called directly
if (require.main === module) {
    updateCurrentWeekQuestions()
        .then(result => {
            console.log('Update completed:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Script failed:', error);
            process.exit(1);
        });
}

module.exports = { updateCurrentWeekQuestions };