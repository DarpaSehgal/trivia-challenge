#!/bin/bash
set -e

echo "🚀 Deploying Trivia App to CDK Lambda Function..."

# Get the actual Lambda function name from CDK
FUNCTION_NAME=$(aws lambda list-functions --region us-west-2 --query 'Functions[?contains(FunctionName, `TriviaChallenge-TriviaFunction`)].FunctionName' --output text)

if [ -z "$FUNCTION_NAME" ]; then
    echo "❌ Could not find TriviaChallenge Lambda function"
    exit 1
fi

echo "📋 Found Lambda function: $FUNCTION_NAME"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create deployment package with all required files
echo "📦 Creating deployment package..."
zip -r trivia-lambda.zip \
    index.js \
    auth-middleware.js \
    valkey-client.js \
    question-service.js \
    security-headers.js \
    health-check.js \
    config.js \
    input-validator.js \
    rate-limiter.js \
    package.json \
    node_modules/ \
    -x "node_modules/.cache/*" "*.git*" "*.DS_Store*" "*.zip"

# Deploy to Lambda
echo "⬆️  Uploading to Lambda function: $FUNCTION_NAME"
aws lambda update-function-code \
    --region us-west-2 \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://trivia-lambda.zip

# Wait for function update to complete
echo "⏳ Waiting for function update to complete..."
aws lambda wait function-updated --region us-west-2 --function-name "$FUNCTION_NAME"

# Test deployment
echo "🧪 Testing deployment..."
sleep 5
curl -X GET "https://lse21lqe2c.execute-api.us-west-2.amazonaws.com/prod/health" \
    --max-time 10 \
    --fail \
    --silent \
    --output /dev/null && echo "✅ Deployment successful!" || echo "❌ Deployment test failed - checking logs..."

# Cleanup
rm -f trivia-lambda.zip

echo "🎉 Deployment complete!"
echo "🔗 API URL: https://lse21lqe2c.execute-api.us-west-2.amazonaws.com/prod"