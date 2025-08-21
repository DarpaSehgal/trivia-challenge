#!/bin/bash
set -e

echo "🚀 Simple Production Deployment..."

# Validate environment
if [ -z "$VALKEY_HOST" ] || [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_CLIENT_ID" ]; then
    echo "❌ Missing required environment variables"
    exit 1
fi

# Validate AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS credentials not configured"
    exit 1
fi

# Get CloudFormation outputs
echo "📋 Getting CloudFormation outputs..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

API_GATEWAY_URL=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text)

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

# Create config.js with actual values
echo "🔧 Generating frontend configuration..."
sed "s|{{API_GATEWAY_URL}}|$API_GATEWAY_URL|g; s|{{USER_POOL_ID}}|$USER_POOL_ID|g; s|{{CLIENT_ID}}|$CLIENT_ID|g" \
  frontend/config.js > /tmp/config.js

# Upload frontend files
echo "📤 Uploading frontend files..."
aws s3 cp frontend/index.html s3://$BUCKET_NAME/ --content-type "text/html"
aws s3 cp /tmp/config.js s3://$BUCKET_NAME/config.js --content-type "application/javascript"

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
zip -r trivia-production.zip ./dist/ -x "*.git*" "node_modules/.cache/*"

aws lambda update-function-code \
    --function-name trivia-game \
    --zip-file fileb://trivia-production.zip || {
    echo "❌ Lambda code update failed"
    exit 1
}

aws lambda update-function-configuration \
    --function-name trivia-game \
    --environment "Variables={VALKEY_HOST=$VALKEY_HOST,COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID,COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID,NODE_ENV=production}" \
    --timeout 30 \
    --memory-size 256 || {
    echo "❌ Lambda configuration update failed"
    exit 1
}

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