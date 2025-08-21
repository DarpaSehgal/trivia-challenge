#!/bin/bash
set -e

echo "🚀 Simple Production Deployment..."

# Validate environment
if [ -z "$VALKEY_HOST" ] || [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_CLIENT_ID" ]; then
    echo "❌ Missing required environment variables"
    exit 1
fi

# Build production package
echo "📦 Building production package..."
rm -rf dist/
mkdir -p dist/
cp -r *.js package*.json dist/
cd dist/
npm ci --only=production --silent
cd ..

# Deploy Lambda
echo "🔧 Deploying Lambda function..."
zip -r trivia-production.zip dist/ -x "*.git*" "node_modules/.cache/*"

aws lambda update-function-code \
    --function-name trivia-game \
    --zip-file fileb://trivia-production.zip

aws lambda update-function-configuration \
    --function-name trivia-game \
    --environment Variables='{"VALKEY_HOST":"'$VALKEY_HOST'","COGNITO_USER_POOL_ID":"'$COGNITO_USER_POOL_ID'","COGNITO_CLIENT_ID":"'$COGNITO_CLIENT_ID'","NODE_ENV":"production"}' \
    --timeout 30 \
    --memory-size 256

# Wait for deployment
echo "⏳ Waiting for deployment..."
aws lambda wait function-updated --function-name trivia-game

# Test deployment
echo "🧪 Testing deployment..."
aws lambda invoke \
    --function-name trivia-game \
    --payload '{"httpMethod":"GET","path":"/health"}' \
    response.json

if grep -q "healthy\|unhealthy" response.json; then
    echo "✅ Production deployment successful!"
    cat response.json
else
    echo "❌ Health check failed"
    cat response.json
    exit 1
fi

rm -f response.json trivia-production.zip
echo "🎉 Production deployment complete!"