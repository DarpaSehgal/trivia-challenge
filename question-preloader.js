const axios = require('axios');
const valkeyClient = require('./valkey-client');

function sanitizeLogValue(value) {
    return String(value || '').replace(/[\r\n\t]/g, ' ').substring(0, 200);
}

const TARGET_QUESTIONS_PER_WEEK = 500;
const API_BATCH_COUNT = 10;

class QuestionPreloader {
    constructor() {
        this.apiDelay = 5100; // 5.1 seconds between API calls (respects 5-second limit)
        this.categories = ['general', 'science', 'history', 'sports', 'entertainment'];
    }

    async preloadWeeklyQuestions() {
        const weekKey = this.getWeekKey();
        console.log(`Starting weekly question preload for week: ${sanitizeLogValue(weekKey)}`);
        
        try {
            // Check if current week questions already exist
            const existingQuestions = await valkeyClient.getWeeklyQuestions(weekKey);
            if (existingQuestions && existingQuestions.length >= TARGET_QUESTIONS_PER_WEEK) {
                console.log(`Week ${sanitizeLogValue(weekKey)} already has ${sanitizeLogValue(existingQuestions.length)} questions`);
                return { success: true, questionsLoaded: existingQuestions.length };
            }

            // Fetch questions (API_BATCH_COUNT API calls × 50 questions each)
            const allQuestions = [];
            const totalCalls = API_BATCH_COUNT;
            
            for (let i = 0; i < totalCalls; i++) {
                try {
                    console.log(`Fetching batch ${i + 1}/${totalCalls}...`);
                    
                    // Fetch 50 questions from all categories
                    const questions = await this.fetchQuestionsFromAPI();
                    
                    if (questions && questions.length > 0) {
                        allQuestions.push(...questions);
                        console.log(`Batch ${i + 1}: Got ${sanitizeLogValue(questions.length)} questions from mixed categories`);
                    }
                    
                    // Wait 5.1 seconds before next API call (except last call)
                    if (i < totalCalls - 1) {
                        await this.sleep(this.apiDelay);
                    }
                    
                } catch (error) {
                    console.error(`Error in batch ${i + 1}:`, sanitizeLogValue(error.message));
                    // Continue with other batches even if one fails
                }
            }

            // Store questions for current week
            if (allQuestions.length > 0) {
                await valkeyClient.storeWeeklyQuestions(weekKey, allQuestions);
                console.log(`Stored ${sanitizeLogValue(allQuestions.length)} questions for week ${sanitizeLogValue(weekKey)}`);
                
                // Clean up previous week's questions
                await this.cleanupOldQuestions(weekKey);
            }

            return { 
                success: true, 
                questionsLoaded: allQuestions.length,
                weekKey: weekKey
            };

        } catch (error) {
            console.error('Weekly preload failed:', sanitizeLogValue(error.message));
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

            const responseCode = response.data.response_code;
            if (responseCode === 0) {
                return response.data.results.map((q, index) => ({
                    id: `mixed_${Date.now()}_${index}`,
                    question: q.question,
                    correct_answer: q.correct_answer,
                    incorrect_answers: q.incorrect_answers,
                    category: q.category,
                    difficulty: q.difficulty
                }));
            } else if (responseCode === 5) {
                throw new Error('Rate limit exceeded');
            } else if (responseCode === 1) {
                throw new Error('No results - insufficient questions in database');
            } else if (responseCode === 2) {
                throw new Error('Invalid parameter');
            } else if (responseCode === 3) {
                throw new Error('Token not found');
            } else if (responseCode === 4) {
                throw new Error('Token empty');
            } else {
                throw new Error(`Unknown API response code: ${responseCode}`);
            }
        } catch (error) {
            console.error('API fetch failed:', sanitizeLogValue(error.message));
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
                console.log(`Cleaned up questions for previous week: ${sanitizeLogValue(previousWeekKey)}`);
            }
        } catch (error) {
            console.error('Cleanup failed:', sanitizeLogValue(error.message));
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