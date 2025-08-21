// Environment validation for production deployment
const requiredEnvVars = [
    'VALKEY_HOST',
    'COGNITO_USER_POOL_ID', 
    'COGNITO_CLIENT_ID',
    'AWS_REGION'
];

function validateEnvironment() {
    const missing = requiredEnvVars.filter(env => {
        const value = process.env[env];
        return !value || typeof value !== 'string' || value.trim() === '';
    });
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing);
        return false;
    }
    
    console.log('✅ All required environment variables are set');
    return true;
}

if (require.main === module) {
    process.exit(validateEnvironment() ? 0 : 1);
}

module.exports = { validateEnvironment };