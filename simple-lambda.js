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
            
            // Simple validation
            const reserved = ['admin', 'test', 'user', 'root'];
            const available = username.length >= 2 && !reserved.includes(username.toLowerCase());
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ available })
            };
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'API working - full implementation needed' })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
