#!/bin/bash
set -e

echo "🚀 Deploying Trivia App Lambda Function..."

# Validate environment
echo "📋 Validating environment variables..."
node validate-env.js || exit 1

# Create deployment package
echo "📦 Creating deployment package..."
zip -r trivia-app-prod.zip \
    index.js \
    valkey-client.js \
    question-service.js \
    validate-env.js \
    node_modules/ \
    -x "node_modules/.cache/*" "*.git*" "*.DS_Store*"

# Deploy to Lambda
echo "⬆️  Uploading to Lambda..."
aws lambda update-function-code \
    --region us-west-2 \
    --function-name trivia-game \
    --zip-file fileb://trivia-app-prod.zip

# Wait for function update to complete
echo "⏳ Waiting for function update to complete..."
aws lambda wait function-updated --region us-west-2 --function-name trivia-game

# Update environment variables if provided
if [ ! -z "$VALKEY_HOST" ]; then
    echo "🔧 Updating environment variables..."
    aws lambda update-function-configuration \
        --region us-west-2 \
        --function-name trivia-game \
        --environment "Variables={VALKEY_HOST=$VALKEY_HOST,COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID,COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID,AWS_REGION=us-west-2}"
fi

# Test deployment
echo "🧪 Testing deployment..."
curl -X GET "https://dknedbhscb.execute-api.us-west-2.amazonaws.com/prod/leaderboard" \
    --max-time 10 \
    --fail \
    --silent \
    --output /dev/null && echo "✅ Deployment successful!" || echo "❌ Deployment test failed!"

# Cleanup
rm -f trivia-app-prod.zip

echo "🎉 Deployment complete!"