const Redis = require('ioredis');

class ValkeyClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.weekCache = null;
    }

    async connect() {
        if (!this.client) {
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
            if (!Array.isArray(questions) || questions.length > 1000) {
                throw new Error('Invalid questions data');
            }
            const client = await this.connect();
            const sanitizedKey = String(weekKey).replace(/[^a-zA-Z0-9_-]/g, '');
            const key = `valkey:weekly_questions:${sanitizedKey}`;
            await this.withTimeout(client.setex(key, 1209600, JSON.stringify(questions)), 2000);
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
            throw error;
        }
    }

    async addSeenQuestions(userId, questionIds) {
        try {
            this.validateUserId(userId);
            
            if (!Array.isArray(questionIds) || questionIds.length === 0) {
                return;
            }
            
            if (questionIds.length > 100) {
                throw new Error('Too many question IDs');
            }
            
            const validQuestionIds = questionIds.filter(id => {
                if (!id || typeof id !== 'string' || id.length > 100) {
                    return false;
                }
                return !/[<>"'&\$\{\$\(]/.test(id);
            });
            
            if (validQuestionIds.length === 0) {
                return;
            }
            
            const client = await this.connect();
            const sanitizedUserId = this.sanitizeUserId(userId);
            const sanitizedQuestionIds = validQuestionIds.map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, ''));
            const key = `valkey:user:${sanitizedUserId}:seen_questions`;
            
            const pipeline = client.multi();
            pipeline.sadd(key, ...sanitizedQuestionIds);
            pipeline.expire(key, 604800);
            await this.withTimeout(pipeline.exec(), 2000);
        } catch (error) {
            console.error('Add seen questions failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    async getSeenQuestions(userId) {
        try {
            this.validateUserId(userId);
            
            const client = await this.connect();
            const sanitizedUserId = this.sanitizeUserId(userId);
            const key = `valkey:user:${sanitizedUserId}:seen_questions`;
            const seenQuestions = await this.withTimeout(client.smembers(key), 2000);
            
            return (seenQuestions || []).filter(id => 
                id && typeof id === 'string' && id.length <= 100
            );
        } catch (error) {
            console.error('Get seen questions failed:', this.sanitizeLogMessage(error.message));
            return [];
        }
    }



    async getSession(sessionId, userId = null) {
        try {
            this.validateSessionId(sessionId);
            
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            const session = await this.withTimeout(client.get(key), 2000);
            
            if (!session) {
                return null;
            }
            
            const sessionData = this.parseJsonSafely(session);
            
            if (userId) {
                this.validateUserId(userId);
                if (sessionData && sessionData.userId !== userId) {
                    throw new Error('Unauthorized session access');
                }
            }
            
            return sessionData;
        } catch (error) {
            console.error('Get session failed:', this.sanitizeLogMessage(error.message));
            // Re-throw authorization errors but return null for other errors
            if (error.message && error.message.includes('Unauthorized')) {
                throw error;
            }
            return null;
        }
    }

    async setSession(sessionId, data, ttl = 3600, userId = null) {
        try {
            this.validateSessionId(sessionId);
            
            if (userId) {
                this.validateUserId(userId);
                if (data.userId && data.userId !== userId) {
                    throw new Error('Session user ID mismatch');
                }
            }
            
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid session data');
            }
            
            const serializedData = JSON.stringify(data);
            if (serializedData.length > 100000) {
                throw new Error('Session data too large');
            }
            
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            await this.withTimeout(client.setex(key, ttl, serializedData), 2000);
        } catch (error) {
            console.error('Set session failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    async updateSession(sessionId, data, userId = null) {
        return this.setSession(sessionId, data, 3600, userId);
    }

    async createSession(sessionId, data, userId = null) {
        return this.setSession(sessionId, data, 3600, userId);
    }

    async deleteSession(sessionId, userId = null) {
        try {
            this.validateSessionId(sessionId);
            
            if (userId) {
                const sessionData = await this.getSession(sessionId, userId);
                if (!sessionData) {
                    throw new Error('Session not found or unauthorized');
                }
            }
            
            const client = await this.connect();
            const sanitizedSessionId = this.sanitizeSessionId(sessionId);
            const key = `valkey:session:${sanitizedSessionId}`;
            await this.withTimeout(client.del(key), 2000);
        } catch (error) {
            console.error('Delete session failed:', this.sanitizeLogMessage(error.message));
            throw error;
        }
    }

    async addToLeaderboard(score, userId, username) {
        try {
            this.validateScore(score);
            this.validateUserId(userId);
            this.validateUsername(username);
            
            const client = await this.connect();
            
            const sanitizedUserId = this.sanitizeUserId(userId);
            const sanitizedUsername = this.sanitizeUsername(username);
            const sanitizedScore = Math.max(0, Math.min(1000, Number(score) || 0));
            
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
            throw error;
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
            return false;
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
            throw error;
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
        return String(message).replace(/[\r\n\t\x00-\x1f\x7f-\x9f<>"'&]/g, ' ').substring(0, 500);
    }
    
    validateUserId(userId) {
        if (!userId || typeof userId !== 'string' || userId.length > 100) {
            throw new Error('Invalid user ID');
        }
        if (!/^[a-zA-Z0-9\-_@.]+$/.test(userId)) {
            throw new Error('User ID contains invalid characters');
        }
        return userId;
    }
    
    validateSessionId(sessionId) {
        if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
            throw new Error('Invalid session ID');
        }
        if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
            throw new Error('Session ID contains invalid characters');
        }
        return sessionId;
    }
    
    validateScore(score) {
        if (typeof score !== 'number' || score < 0 || score > 1000) {
            throw new Error('Invalid score');
        }
        return score;
    }
    
    validateUsername(username) {
        if (!username || typeof username !== 'string' || username.length > 50) {
            throw new Error('Invalid username');
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            throw new Error('Username contains invalid characters');
        }
        return username;
    }

    sanitizeUserId(userId) {
        if (!userId) return '';
        return String(userId).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
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
            question: this.sanitizeLogMessage(String(question.question || '')),
            correct_answer: this.sanitizeLogMessage(String(question.correct_answer || '')),
            incorrect_answers: Array.isArray(question.incorrect_answers) 
                ? question.incorrect_answers.map(a => this.sanitizeLogMessage(String(a)))
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
            .replace(/'/g, '&#x27;');
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