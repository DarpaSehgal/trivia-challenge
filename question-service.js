const axios = require('axios');
const valkeyClient = require('./valkey-client');

class QuestionService {
    constructor() {
        this.lastApiCall = 0;
        this.minInterval = 1500; // 1.5 seconds between API calls (40 calls/minute max)
    }

    async fetchAndCacheQuestions(category = 'general') {
        try {
            // Check cache first with timeout
            let questions = await Promise.race([
                valkeyClient.getQuestions(category),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Valkey timeout')), 2000))
            ]);
            
            if (questions && questions.length >= 50) {
                return questions;
            }
        } catch (error) {
            console.error('Valkey cache check failed:', error);
        }

        try {
            // Rate limiting: ensure minimum interval between API calls
            const now = Date.now();
            const timeSinceLastCall = now - this.lastApiCall;
            if (timeSinceLastCall < this.minInterval) {
                await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
            }
            this.lastApiCall = Date.now();

            // Fetch from OpenTDB API with timeout
            const response = await axios.get('https://opentdb.com/api.php', {
                params: {
                    amount: 50,
                    category: this.getCategoryId(category),
                    type: 'multiple'
                },
                timeout: 3000
            });

            if (response.data.response_code === 0) {
                const questions = response.data.results.map((q, index) => ({
                    id: `${category}_${index}_${Date.now()}`,
                    question: q.question,
                    correct_answer: q.correct_answer,
                    incorrect_answers: q.incorrect_answers,
                    category: q.category,
                    difficulty: q.difficulty
                }));

                // Try to cache with timeout, don't wait if it fails
                valkeyClient.cacheQuestions(category, questions).catch(err => 
                    console.error('Failed to cache questions:', err)
                );
                return questions;
            }
            
            throw new Error('Failed to fetch questions from OpenTDB');
        } catch (error) {
            console.error('Error fetching questions:', error);
            return this.getMockQuestions();
        }
    }

    async getGameQuestions(userId, category = 'general') {
        try {
            const allQuestions = await this.fetchAndCacheQuestions(category);
            
            // Try to get seen questions with timeout
            let seenQuestions = [];
            try {
                seenQuestions = await Promise.race([
                    valkeyClient.getSeenQuestions(userId),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
                ]);
            } catch (error) {
                console.error('Failed to get seen questions, using empty set:', error);
            }
            
            // Filter out seen questions
            const unseenQuestions = allQuestions.filter(q => !seenQuestions.includes(q.id));
            
            // If less than 5 unseen questions, just use all questions
            if (unseenQuestions.length < 5) {
                return this.shuffleArray(allQuestions).slice(0, 5);
            }
            
            return this.shuffleArray(unseenQuestions).slice(0, 5);
        } catch (error) {
            console.error('Error getting game questions, using mock:', error);
            return this.getMockQuestions();
        }
    }
    
    getMockQuestions() {
        return [
            { id: 'mock-1', question: 'What is the capital of France?', correct_answer: 'Paris', incorrect_answers: ['London', 'Berlin', 'Madrid'] },
            { id: 'mock-2', question: 'Which planet is closest to the Sun?', correct_answer: 'Mercury', incorrect_answers: ['Venus', 'Earth', 'Mars'] },
            { id: 'mock-3', question: 'What is 2 + 2?', correct_answer: '4', incorrect_answers: ['3', '5', '6'] },
            { id: 'mock-4', question: 'Who painted the Mona Lisa?', correct_answer: 'Da Vinci', incorrect_answers: ['Van Gogh', 'Picasso', 'Monet'] },
            { id: 'mock-5', question: 'What is the largest ocean?', correct_answer: 'Pacific', incorrect_answers: ['Atlantic', 'Indian', 'Arctic'] }
        ];
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

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

module.exports = new QuestionService();