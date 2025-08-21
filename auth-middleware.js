const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
    jwksUri: `https://cognito-idp.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

async function verifyToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, getKey, {
            audience: process.env.COGNITO_CLIENT_ID,
            issuer: `https://cognito-idp.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
            algorithms: ['RS256']
        }, (err, decoded) => {
            if (err) {
                reject(err);
            } else {
                resolve(decoded);
            }
        });
    });
}

function requireAuth(event) {
    const token = event.headers.Authorization?.replace('Bearer ', '') || event.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        throw new Error('Authorization token required');
    }
    
    return verifyToken(token);
}

function extractUserId(event) {
    try {
        const token = event.headers.Authorization?.replace('Bearer ', '') || event.headers.authorization?.replace('Bearer ', '');
        if (!token) return 'anonymous';
        
        const decoded = jwt.decode(token);
        return decoded?.sub || decoded?.['cognito:username'] || 'anonymous';
    } catch (error) {
        return 'anonymous';
    }
}

module.exports = {
    requireAuth,
    extractUserId,
    verifyToken
};