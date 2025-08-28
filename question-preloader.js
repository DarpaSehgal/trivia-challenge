const axios = require('axios');
const valkeyClient = require('./valkey-client');

class QuestionPreloader {
    constructor() {
        this.apiDelay = 5100; // 5.1 seconds between API calls (respects 5-second limit)
        this.categories = ['general', 'science', 'history', 'sports', 'entertainment'];
    }

    async preloadWeeklyQuestions() {
        const weekKey = this.getWeekKey();
        console.log(`Starting weekly question preload for week: ${weekKey}`);
        
        try {
            // Check if current week questions already exist
            const existingQuestions = await valkeyClient.getWeeklyQuestions(weekKey);
            if (existingQuestions && existingQuestions.length >= 500) {
                console.log(`Week ${weekKey} already has ${existingQuestions.length} questions`);
                return { success: true, questionsLoaded: existingQuestions.length };
            }

            // Fetch 500 questions (10 API calls × 50 questions each)
            const allQuestions = [];
            const totalCalls = 10;
            
            for (let i = 0; i < totalCalls; i++) {
                try {
                    console.log(`Fetching batch ${i + 1}/${totalCalls}...`);
                    
                    // Fetch 50 questions from all categories
                    const questions = await this.fetchQuestionsFromAPI();
                    
                    if (questions && questions.length > 0) {
                        allQuestions.push(...questions);
                        console.log(`Batch ${i + 1}: Got ${questions.length} questions from mixed categories`);
                    }
                    
                    // Wait 5.1 seconds before next API call (except last call)
                    if (i < totalCalls - 1) {
                        await this.sleep(this.apiDelay);
                    }
                    
                } catch (error) {
                    console.error(`Error in batch ${i + 1}:`, error.message);
                    // Continue with other batches even if one fails
                }
            }

            // Store questions for current week
            if (allQuestions.length > 0) {
                await valkeyClient.storeWeeklyQuestions(weekKey, allQuestions);
                console.log(`Stored ${allQuestions.length} questions for week ${weekKey}`);
                
                // Clean up previous week's questions
                await this.cleanupOldQuestions(weekKey);
            }

            return { 
                success: true, 
                questionsLoaded: allQuestions.length,
                weekKey: weekKey
            };

        } catch (error) {
            console.error('Weekly preload failed:', error);
            return { success: false, error: error.message };
        }
    }

    async fetchQuestionsFromAPI() {
        try {
            const response = await axios.get('https://opentdb.com/api.php', {
                params: {
                    amount: 50,
                    type: 'multiple'
                },
                timeout: 10000
            });

            if (response.data.response_code === 0) {
                return response.data.results.map((q, index) => ({
                    id: `mixed_${Date.now()}_${index}`,
                    question: q.question,
                    correct_answer: q.correct_answer,
                    incorrect_answers: q.incorrect_answers,
                    category: q.category,
                    difficulty: q.difficulty
                }));
            } else if (response.data.response_code === 5) {
                throw new Error('Rate limit exceeded');
            }
            
            return [];
        } catch (error) {
            console.error('API fetch failed:', error.message);
            return [];
        }
    }

    async cleanupOldQuestions(currentWeekKey) {
        try {
            // Get previous week key
            const previousWeekKey = this.getPreviousWeekKey(currentWeekKey);
            
            // Only delete if current week has enough questions
            const currentQuestions = await valkeyClient.getWeeklyQuestions(currentWeekKey);
            if (currentQuestions && currentQuestions.length >= 400) {
                await valkeyClient.deleteWeeklyQuestions(previousWeekKey);
                console.log(`Cleaned up questions for previous week: ${previousWeekKey}`);
            }
        } catch (error) {
            console.error('Cleanup failed:', error.message);
        }
    }

    getWeekKey() {
        const now = new Date();
        const year = now.getFullYear();
        const week = this.getWeekNumber(now);
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }

    getPreviousWeekKey(currentWeekKey) {
        const [year, weekStr] = currentWeekKey.split('-W');
        const week = parseInt(weekStr);
        
        if (week === 1) {
            return `${parseInt(year) - 1}-W52`;
        } else {
            return `${year}-W${(week - 1).toString().padStart(2, '0')}`;
        }
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    getCategoryId(category) {
        const categories = {
            'general': 9,
            'science': 17,
            'history': 23,
            'sports': 21,
            'entertainment': 11
        };
        return categories[category] || 9;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new QuestionPreloader();