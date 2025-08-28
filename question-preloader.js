const axios = require('axios');
const valkeyClient = require('./valkey-client');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');

function sanitizeLogValue(value) {
    return String(value || '').replace(/[\r\n\t\x00-\x1f\x7f-\x9f<>"'&]/g, ' ').slice(0, 200);
}

function validateInput(input, type, maxLength = 100) {
    if (input === null || input === undefined) {
        throw new Error(`${type} is required`);
    }
    const str = String(input);
    if (str.length > maxLength) {
        throw new Error(`${type} exceeds maximum length of ${maxLength}`);
    }
    // Sanitize HTML entities and dangerous characters
    return validator.escape(str);
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
            for (let i = 0; i < API_BATCH_COUNT; i++) {
                try {
                    console.log(`Fetching batch ${i + 1}/${API_BATCH_COUNT}...`);
                    
                    // Fetch 50 questions from all categories
                    const questions = await this.fetchQuestionsFromAPI();
                    
                    if (questions && questions.length > 0) {
                        allQuestions.push(...questions);
                        console.log(`Batch ${i + 1}/${API_BATCH_COUNT}: Got ${sanitizeLogValue(questions.length)} questions from mixed categories`);
                    }
                    
                    if (i < API_BATCH_COUNT - 1) {
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
                    type: 'multiple',
                    difficulty: Math.random() < 0.5 ? 'easy' : 'medium'
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'AWS-Lambda-Trivia-App/1.0'
                },
                maxRedirects: 0,
                validateStatus: (status) => status === 200
            });

            if (!response.data || typeof response.data !== 'object') {
                throw new Error('Invalid API response format');
            }

            const responseCode = response.data.response_code;
            if (responseCode === 0) {
                if (!Array.isArray(response.data.results)) {
                    throw new Error('Invalid results format');
                }
                
                const validQuestions = [];
                for (const q of response.data.results) {
                    try {
                        // Validate and sanitize question data
                        if (!q || typeof q !== 'object') {
                            continue;
                        }
                        
                        const sanitizedQuestion = {
                            id: uuidv4(),
                            question: validateInput(q.question, 'question', 500),
                            correct_answer: validateInput(q.correct_answer, 'correct_answer', 200),
                            incorrect_answers: Array.isArray(q.incorrect_answers) 
                                ? q.incorrect_answers.map(a => validateInput(a, 'incorrect_answer', 200))
                                : [],
                            category: validateInput(q.category || 'General', 'category', 100),
                            difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium'
                        };
                        
                        validQuestions.push(sanitizedQuestion);
                    } catch (validationError) {
                        console.warn(`Skipping invalid question: ${sanitizeLogValue(validationError.message)}`);
                    }
                }
                return validQuestions;
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
                throw new Error(`Unknown API response code: ${sanitizeLogValue(responseCode)}`);
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
            const prevYear = parseInt(year) - 1;
            const weeksInPrevYear = this.getWeeksInYear(prevYear);
            return `${prevYear}-W${weeksInPrevYear.toString().padStart(2, '0')}`;
        } else {
            return `${year}-W${(week - 1).toString().padStart(2, '0')}`;
        }
    }
    
    getWeeksInYear(year) {
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);
        return jan1.getDay() === 4 || dec31.getDay() === 4 ? 53 : 52;
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }



    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const questionPreloader = new QuestionPreloader();

// Lambda handler function
const handler = async (event, context) => {
    // Set timeout buffer
    const timeoutBuffer = 30000;
    const maxExecutionTime = context.getRemainingTimeInMillis() - timeoutBuffer;
    
    try {
        if (maxExecutionTime < 60000) {
            throw new Error('Insufficient execution time remaining');
        }
        
        console.log('Question preloader Lambda triggered');
        const result = await questionPreloader.preloadWeeklyQuestions();
        
        return {
            statusCode: result.success ? 200 : 500,
            body: JSON.stringify({
                success: result.success,
                questionsLoaded: result.questionsLoaded || 0,
                weekKey: result.weekKey,
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        const sanitizedError = sanitizeLogValue(error.message || 'Unknown error');
        console.error('Handler error:', sanitizedError);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: 'Question preloader failed',
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports = { questionPreloader, handler };