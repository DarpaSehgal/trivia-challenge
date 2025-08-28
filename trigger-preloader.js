const questionPreloader = require('./question-preloader');

async function triggerPreloader() {
    console.log('Manually triggering question preloader...');
    
    try {
        const result = await questionPreloader.preloadWeeklyQuestions();
        console.log('Preloader result:', result);
        
        if (result.success) {
            console.log(`✅ Successfully loaded ${result.questionsLoaded} questions for week ${result.weekKey}`);
        } else {
            console.log('❌ Preloader failed:', result.error);
        }
    } catch (error) {
        console.error('❌ Error running preloader:', error.message);
    }
    
    process.exit(0);
}

triggerPreloader();