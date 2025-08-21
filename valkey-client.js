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
            const key = `valkey:questions:${category}`;
            await this.withTimeout(client.setEx(key, 86400, JSON.stringify(questions)), 2000);
        } catch (error) {
            console.error('Cache questions failed:', error);
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
            const key = `valkey:questions:${category}`;
            const cached = await this.withTimeout(client.get(key), 2000);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Get questions failed:', error);
            return null;
        }
    }

    async addSeenQuestion(userId, questionId) {
        try {
            const client = await this.connect();
            const key = `valkey:user:${userId}:seen_questions`;
            await this.withTimeout(client.sAdd(key, questionId), 2000);
            await this.withTimeout(client.expire(key, 604800), 2000);
        } catch (error) {
            console.error('Add seen question failed:', error);
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

    async createSession(sessionId, data) {
        try {
            const client = await this.connect();
            const key = `valkey:session:${sessionId}`;
            await this.withTimeout(client.setEx(key, 3600, JSON.stringify(data)), 2000);
        } catch (error) {
            console.error('Create session failed:', error);
            // Don't throw - use in-memory fallback
        }
    }

    async getSession(sessionId) {
        try {
            const client = await this.connect();
            const key = `valkey:session:${sessionId}`;
            const session = await this.withTimeout(client.get(key), 2000);
            return session ? JSON.parse(session) : null;
        } catch (error) {
            console.error('Get session failed:', error);
            return null;
        }
    }

    async updateSession(sessionId, data) {
        try {
            const client = await this.connect();
            const key = `valkey:session:${sessionId}`;
            await this.withTimeout(client.setEx(key, 3600, JSON.stringify(data)), 2000);
        } catch (error) {
            console.error('Update session failed:', error);
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
            const key = `valkey:usernames:${username.toLowerCase()}`;
            const exists = await this.withTimeout(client.exists(key), 2000);
            return exists === 0;
        } catch (error) {
            console.error('Check username failed:', error);
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

    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }
}

module.exports = new ValkeyClient();