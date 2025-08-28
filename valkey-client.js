const Redis = require('ioredis');

class ValkeyClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.weekCache = null;
    }

    async connect() {
        if (!this.client || !this.isConnected) {
            this.client = new Redis({
                host: process.env.VALKEY_HOST,
                port: 6379,
                connectTimeout: 3000,
                commandTimeout: 2000,
                tls: {},
                lazyConnect: true
            });
            
            this.client.on('error', (err) => {
                console.error('Valkey error', this.sanitizeLogMessage(err.message));
                this.isConnected = false;
            });
            
            this.client.on('disconnect', () => {
                this.isConnected = false;
            });
            
            try {
                await this.client.connect();
                this.isConnected = true;
            } catch (error) {
                console.error('Valkey connection failed:', error);
                this.client = null;
                this.isConnected = false;
                throw error;
            }
        }
        return this.client;
    }





    async storeWeeklyQuestions(weekKey, questions) {
        try {
            const client = await this.connect();
            const key = `valkey:weekly_questions:${weekKey}`;
            await this.withTimeout(client.setex(key, 1209600, JSON.stringify(questions)), 2000); // 2 weeks TTL
        } catch (error) {
            console.error('Store weekly questions failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    async getWeeklyQuestions(weekKey) {
        try {
            const client = await this.connect();
            const key = `valkey:weekly_questions:${weekKey}`;
            const cached = await this.withTimeout(client.get(key), 2000);
            return cached ? this.parseJsonSafely(cached) : null;
        } catch (error) {
            console.error('Get weekly questions failed:', this.sanitizeLogMessage(error.message));
            return null;
        }
    }

    async deleteWeeklyQuestions(weekKey) {
        try {
            const client = await this.connect();
            const key = `valkey:weekly_questions:${weekKey}`;
            await this.withTimeout(client.del(key), 2000);
        } catch (error) {
            console.error('Delete weekly questions failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    async withTimeout(promise, ms) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Operation timeout')), ms);
        });
        
        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }



    async addSeenQuestion(userId, questionId) {
        try {
            const client = await this.connect();
            const sanitizedUserId = this.sanitizeUserId(userId);
            const sanitizedQuestionId = String(questionId).replace(/[^a-zA-Z0-9_-]/g, '');
            const key = `valkey:user:${sanitizedUserId}:seen_questions`;
            
            // Use pipeline for atomic operation
            const pipeline = client.multi();
            pipeline.sadd(key, sanitizedQuestionId);
            pipeline.expire(key, 604800);
            await this.withTimeout(pipeline.exec(), 2000);
        } catch (error) {
            console.error('Add seen question failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async addSeenQuestions(userId, questionIds) {
        try {
            const client = await this.connect();
            const sanitizedUserId = this.sanitizeUserId(userId);
            const sanitizedQuestionIds = questionIds.map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, ''));
            const key = `valkey:user:${sanitizedUserId}:seen_questions`;
            
            // Batch operation using pipeline
            const pipeline = client.multi();
            pipeline.sadd(key, ...sanitizedQuestionIds);
            pipeline.expire(key, 604800);
            await this.withTimeout(pipeline.exec(), 2000);
        } catch (error) {
            console.error('Add seen questions failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async getSeenQuestions(userId) {
        try {
            const client = await this.connect();
            const sanitizedUserId = this.sanitizeUserId(userId);
            const key = `valkey:user:${sanitizedUserId}:seen_questions`;
            return await this.withTimeout(client.smembers(key), 2000);
        } catch (error) {
            console.error('Get seen questions failed:', this.sanitizeLogMessage(error.message));
            return [];
        }
    }



    async getSession(sessionId) {
        try {
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            const session = await this.withTimeout(client.get(key), 2000);
            return session ? this.parseJsonSafely(session) : null;
        } catch (error) {
            console.error('Get session failed:', this.sanitizeLogMessage(error.message));
            return null;
        }
    }

    async setSession(sessionId, data, ttl = 3600) {
        try {
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            await this.withTimeout(client.setex(key, ttl, JSON.stringify(data)), 2000);
        } catch (error) {
            console.error('Set session failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async updateSession(sessionId, data) {
        return this.setSession(sessionId, data);
    }

    async createSession(sessionId, data) {
        return this.setSession(sessionId, data);
    }

    async deleteSession(sessionId) {
        try {
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            await this.withTimeout(client.del(key), 2000);
        } catch (error) {
            console.error('Delete session failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async addToLeaderboard(score, userId, username) {
        try {
            const client = await this.connect();
            
            // Sanitize inputs to prevent injection attacks
            const sanitizedUserId = this.sanitizeUserId(userId);
            const sanitizedUsername = this.sanitizeUsername(username);
            const sanitizedScore = Math.max(0, Math.min(10000, Number(score) || 0));
            
            const now = new Date();
            const year = now.getFullYear();
            const week = this.getWeekNumber(now);
            const key = `valkey:leaderboard:${year}-${week}`;
            
            const pipeline = client.multi();
            pipeline.zadd(key, sanitizedScore, `${sanitizedUserId}:${sanitizedUsername}`);
            pipeline.expire(key, 1209600);
            await this.withTimeout(pipeline.exec(), 2000);
        } catch (error) {
            console.error('Add to leaderboard failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async getLeaderboard() {
        try {
            const client = await this.connect();
            const now = new Date();
            const year = now.getFullYear();
            const week = this.getWeekNumber(now);
            const key = `valkey:leaderboard:${year}-${week}`;
            
            const results = await this.withTimeout(client.zrevrange(key, 0, 9, 'WITHSCORES'), 2000);
            const leaderboard = [];
            for (let i = 0; i < results.length; i += 2) {
                const parts = results[i].split(':');
                const userId = parts[0];
                const username = parts.slice(1).join(':'); // Handle usernames with colons
                leaderboard.push({ userId, username, score: parseInt(results[i + 1]) });
            }
            return leaderboard;
        } catch (error) {
            console.error('Get leaderboard failed:', this.sanitizeLogMessage(error.message));
            return [];
        }
    }

    async isUsernameAvailable(username) {
        try {
            const client = await this.connect();
            const sanitizedUsername = this.sanitizeUsername(username);
            const key = `valkey:usernames:${sanitizedUsername}`;
            const exists = await this.withTimeout(client.exists(key), 2000);
            return exists === 0;
        } catch (error) {
            console.error('Check username failed:', this.sanitizeLogMessage(error.message));
            return true;
        }
    }

    async storeUsername(username, userId) {
        try {
            const client = await this.connect();
            const sanitizedUsername = this.sanitizeUsername(username);
            const key = `valkey:usernames:${sanitizedUsername}`;
            await this.withTimeout(client.set(key, userId), 2000);
        } catch (error) {
            console.error('Store username failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async ping() {
        try {
            const client = await this.connect();
            return await this.withTimeout(client.ping(), 2000);
        } catch (error) {
            console.error('Ping failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    sanitizeLogMessage(message) {
        return String(message).replace(/[\r\n\t]/g, ' ').substring(0, 500);
    }

    sanitizeUserId(userId) {
        if (!userId) return '';
        return String(userId).replace(/[^a-zA-Z0-9@._-]/g, '').substring(0, 100);
    }

    sanitizeSessionId(sessionId) {
        if (!sessionId) return '';
        return String(sessionId).replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
    }

    sanitizeCategory(category) {
        return String(category).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    }

    sanitizeQuestionData(data) {
        if (Array.isArray(data)) {
            return data.map(q => this.sanitizeQuestion(q));
        }
        return this.sanitizeQuestion(data);
    }

    sanitizeQuestion(question) {
        if (!question || typeof question !== 'object') return question;
        return {
            ...question,
            question: this.escapeHtml(String(question.question || '')),
            correct_answer: this.escapeHtml(String(question.correct_answer || '')),
            incorrect_answers: Array.isArray(question.incorrect_answers) 
                ? question.incorrect_answers.map(a => this.escapeHtml(String(a)))
                : []
        };
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    sanitizeUsername(username) {
        if (!username) return '';
        return String(username).toLowerCase().replace(/[^a-z0-9_-]/g, '').substring(0, 20);
    }

    parseJsonSafely(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('JSON parse failed:', this.sanitizeLogMessage(error.message));
            return null;
        }
    }

    getWeekNumber(date) {
        // Cache result for current date to avoid recalculation - use UTC to prevent timezone issues
        const dateStr = date.toISOString().split('T')[0];
        if (this.weekCache && this.weekCache.date === dateStr) {
            return this.weekCache.week;
        }
        
        // ISO 8601 week numbering
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        
        this.weekCache = { date: dateStr, week };
        return week;
    }
}

module.exports = new ValkeyClient();