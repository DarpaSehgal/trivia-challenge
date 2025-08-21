const redis = require('redis');

class ValkeyClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    async connect() {
        if (!this.client || !this.isConnected) {
            this.client = redis.createClient({
                socket: {
                    host: process.env.VALKEY_HOST,
                    port: 6379,
                    connectTimeout: 3000,
                    commandTimeout: 2000,
                    tls: true,
                    rejectUnauthorized: false
                }
            });
            
            this.client.on('error', (err) => {
                console.error('Valkey error', err);
                this.isConnected = false;
            });
            
            this.client.on('disconnect', () => {
                this.isConnected = false;
            });
            
            try {
                await Promise.race([
                    this.client.connect(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3000))
                ]);
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

    async cacheQuestions(category, questions) {
        try {
            const client = await this.connect();
            const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
            const key = `valkey:questions:${sanitizedCategory}`;
            await this.withTimeout(client.setEx(key, 86400, JSON.stringify(questions)), 2000);
        } catch (error) {
            console.error('Cache questions failed:', this.sanitizeLogMessage(error.message));
            // Don't throw - graceful degradation
        }
    }

    async withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), ms))
        ]);
    }

    async getQuestions(category) {
        try {
            const client = await this.connect();
            const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
            const key = `valkey:questions:${sanitizedCategory}`;
            const cached = await this.withTimeout(client.get(key), 2000);
            return cached ? this.parseJsonSafely(cached) : null;
        } catch (error) {
            console.error('Get questions failed:', this.sanitizeLogMessage(error.message));
            return null;
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
            pipeline.sAdd(key, sanitizedQuestionId);
            pipeline.expire(key, 604800);
            await this.withTimeout(pipeline.exec(), 2000);
        } catch (error) {
            console.error('Add seen question failed:', this.sanitizeLogMessage(error.message));
        }
    }

    async getSeenQuestions(userId) {
        try {
            const client = await this.connect();
            const key = `valkey:user:${userId}:seen_questions`;
            return await this.withTimeout(client.sMembers(key), 2000);
        } catch (error) {
            console.error('Get seen questions failed:', error);
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
            await this.withTimeout(client.setEx(key, ttl, JSON.stringify(data)), 2000);
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
            const now = new Date();
            const year = now.getFullYear();
            const week = this.getWeekNumber(now);
            const key = `valkey:leaderboard:${year}-${week}`;
            
            await this.withTimeout(client.zAdd(key, { score, value: `${userId}:${username}` }), 2000);
            await this.withTimeout(client.expire(key, 1209600), 2000);
        } catch (error) {
            console.error('Add to leaderboard failed:', error);
        }
    }

    async getLeaderboard() {
        try {
            const client = await this.connect();
            const now = new Date();
            const year = now.getFullYear();
            const week = this.getWeekNumber(now);
            const key = `valkey:leaderboard:${year}-${week}`;
            
            const results = await this.withTimeout(client.zRangeWithScores(key, 0, 9, { REV: true }), 2000);
            return results.map(item => {
                const [userId, username] = item.value.split(':');
                return { userId, username, score: item.score };
            });
        } catch (error) {
            console.error('Get leaderboard failed:', error);
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
            const key = `valkey:usernames:${username.toLowerCase()}`;
            await this.withTimeout(client.set(key, userId), 2000);
        } catch (error) {
            console.error('Store username failed:', error);
        }
    }

    async ping() {
        try {
            const client = await this.connect();
            return await this.withTimeout(client.ping(), 2000);
        } catch (error) {
            console.error('Ping failed:', error);
            throw error;
        }
    }

    sanitizeLogMessage(message) {
        return String(message).replace(/[\r\n\t]/g, ' ').substring(0, 500);
    }

    sanitizeUserId(userId) {
        return String(userId).replace(/[^a-zA-Z0-9@._-]/g, '').substring(0, 100);
    }

    sanitizeSessionId(sessionId) {
        return String(sessionId).replace(/[^a-zA-Z0-9-]/g, '').substring(0, 50);
    }

    sanitizeUsername(username) {
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
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }
}

module.exports = new ValkeyClient();