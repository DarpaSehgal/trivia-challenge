const axios = require('axios');
const valkeyClient = require('./valkey-client');

// HTML entity decoder
const HTML_ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&aelig;': 'æ',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&ccedil;': 'ç',
    '&uuml;': 'ü',
    '&ouml;': 'ö',
    '&auml;': 'ä',
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&ecirc;': 'ê',
    '&euml;': 'ë',
    '&ntilde;': 'ñ',
    '&agrave;': 'à',
    '&aacute;': 'á',
    '&acirc;': 'â',
    '&atilde;': 'ã',
    '&ugrave;': 'ù',
    '&uacute;': 'ú',
    '&ucirc;': 'û',
    '&igrave;': 'ì',
    '&icirc;': 'î',
    '&iuml;': 'ï',
    '&ograve;': 'ò',
    '&ocirc;': 'ô',
    '&otilde;': 'õ',
    '&lrm;': '',
    '&rlm;': ''
};

function decodeHtmlEntities(text) {
    if (!text || typeof text !== 'string') return text;
    
    const entityRegex = /&(?:amp|lt|gt|quot|#x27|#039|apos|nbsp|rsquo|lsquo|rdquo|ldquo|aelig|[ioa](?:acute|grave|circ|tilde|uml)|[eun](?:acute|grave|circ|tilde|uml)|ccedil|[lr]m);/g;
    
    return text.replace(entityRegex, (match) => {
        return HTML_ENTITIES[match] || match;
    });
}

function getWeekKey() {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function fetchQuestionsFromAPI(amount = 50, category = 9) {
    try {
        const response = await axios.get('https://opentdb.com/api.php', {
            params: {
                amount,
                category,
                type: 'multiple',
                encode: 'url3986'
            },
            timeout: 10000
        });

        if (response.data.response_code !== 0) {
            throw new Error(`API error: ${response.data.response_code}`);
        }

        return response.data.results.map((q, index) => ({
            id: `api_${category}_${Date.now()}_${index}`,
            question: decodeHtmlEntities(decodeURIComponent(q.question)),
            correct_answer: decodeHtmlEntities(decodeURIComponent(q.correct_answer)),
            incorrect_answers: q.incorrect_answers.map(a => decodeHtmlEntities(decodeURIComponent(a))),
            category: decodeHtmlEntities(decodeURIComponent(q.category)),
            difficulty: q.difficulty
        }));
    } catch (error) {
        console.error('Failed to fetch from API:', error.message);
        return [];
    }
}

async function loadWeeklyQuestions() {
    try {
        console.log('Loading questions for current week...');
        
        const weekKey = getWeekKey();
        console.log(`Week key: ${weekKey}`);
        
        // Fetch questions from multiple categories
        const categories = [9, 17, 23, 21, 11]; // General, Science, History, Sports, Entertainment
        let allQuestions = [];
        
        for (const category of categories) {
            console.log(`Fetching 50 questions from category ${category}...`);
            const questions = await fetchQuestionsFromAPI(50, category);
            allQuestions = allQuestions.concat(questions);
            
            // Rate limiting - wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`Total questions fetched: ${allQuestions.length}`);
        
        if (allQuestions.length > 0) {
            await valkeyClient.storeWeeklyQuestions(weekKey, allQuestions);
            console.log(`Stored ${allQuestions.length} questions in cache for week ${weekKey}`);
            
            // Test retrieval
            const cached = await valkeyClient.getWeeklyQuestions(weekKey);
            console.log(`Verified: ${cached ? cached.length : 0} questions in cache`);
        } else {
            console.log('No questions fetched, cache not updated');
        }
        
    } catch (error) {
        console.error('Error loading weekly questions:', error);
    }
}

// Run the script
loadWeeklyQuestions().then(() => {
    console.log('Question loading completed');
    process.exit(0);
}).catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});