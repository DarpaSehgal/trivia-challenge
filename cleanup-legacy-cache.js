const valkeyClient = require('./valkey-client');

async function cleanupLegacyCache() {
    try {
        const client = await valkeyClient.connect();
        
        // Categories that might have old cache keys
        const categories = ['general', 'science', 'history', 'sports', 'entertainment'];
        
        console.log('Cleaning up legacy category cache keys...');
        
        for (const category of categories) {
            const key = `valkey:questions:${category}`;
            try {
                const deleted = await client.del(key);
                if (deleted > 0) {
                    console.log(`Deleted legacy cache key: ${key}`);
                }
            } catch (error) {
                console.error(`Failed to delete ${key}:`, error.message);
            }
        }
        
        console.log('Legacy cache cleanup completed');
    } catch (error) {
        console.error('Cleanup failed:', error);
    }
}

// Export for use in other functions
module.exports = { cleanupLegacyCache };

// Run if called directly
if (require.main === module) {
    cleanupLegacyCache().then(() => process.exit(0));
}