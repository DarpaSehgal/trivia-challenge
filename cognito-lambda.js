const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-west-2' });

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const path = event.path;
        const method = event.httpMethod;
        
        if (method === 'POST' && path.includes('check-username')) {
            const body = JSON.parse(event.body || '{}');
            const username = body.username || '';
            
            // Basic validation
            if (username.length < 2 || username.length > 20) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ available: false, error: 'Username must be 2-20 characters' })
                };
            }
            
            // Check reserved usernames
            const reserved = ['admin', 'test', 'user', 'root', 'administrator', 'support', 'help'];
            if (reserved.includes(username.toLowerCase())) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ available: false })
                };
            }
            
            // Check Cognito for existing preferred_username
            try {
                const command = new ListUsersCommand({
                    UserPoolId: process.env.COGNITO_USER_POOL_ID,
                    Filter: `preferred_username = "${username}"`
                });
                
                const response = await cognitoClient.send(command);
                const available = response.Users.length === 0;
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ available })
                };
            } catch (cognitoError) {
                console.error('Cognito check failed:', cognitoError);
                // Fallback to basic validation
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ available: true })
                };
            }
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'API working' })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
