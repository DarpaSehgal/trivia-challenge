const axios = require('axios');
const fs = require('fs');

async function fetchMockQuestions() {
    try {
        console.log('Fetching 50 multiple choice questions from OpenTDB...');
        
        const response = await axios.get('https://opentdb.com/api.php', {
            params: {
                amount: 50,
                type: 'multiple'
            },
            timeout: 10000
        });

        if (response.data.response_code !== 0) {
            throw new Error(`OpenTDB API error: ${response.data.response_code}`);
        }

        const questions = response.data.results.map((q, index) => ({
            id: `mock-${index + 1}`,
            question: q.question,
            correct_answer: q.correct_answer,
            incorrect_answers: q.incorrect_answers
        }));

        console.log(`Successfully fetched ${questions.length} questions`);
        
        // Update question-service.js with new mock questions
        const questionServicePath = './question-service.js';
        let content = fs.readFileSync(questionServicePath, 'utf8');
        
        const mockQuestionsStr = JSON.stringify(questions, null, 12);
        
        const oldMockPattern = /getMockQuestions\(\) \{[\s\S]*?return \[[\s\S]*?\];[\s\S]*?\}/;
        const newMockMethod = `getMockQuestions() {
        return ${mockQuestionsStr};
    }`;
        
        content = content.replace(oldMockPattern, newMockMethod);
        
        fs.writeFileSync(questionServicePath, content);
        console.log('Updated question-service.js with new mock questions');
        
    } catch (error) {
        console.error('Failed to fetch mock questions:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    fetchMockQuestions();
}

module.exports = { fetchMockQuestions };