#!/bin/bash
set -e

echo "🚀 Deploying Complete Trivia Challenge App..."

# Check if required parameters are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: ./deploy-complete.sh <subnet-ids> <security-group-id>"
    echo "Example: ./deploy-complete.sh subnet-123,subnet-456 sg-789"
    exit 1
fi

SUBNET_IDS=$1
SECURITY_GROUP_ID=$2

echo "📦 Deploying infrastructure..."
aws cloudformation deploy \
  --template-file cloudformation.yml \
  --stack-name trivia-challenge \
  --parameter-overrides \
    ValkeySubnetIds=$SUBNET_IDS \
    ValkeySecurityGroupId=$SECURITY_GROUP_ID \
  --capabilities CAPABILITY_IAM

echo "📋 Getting infrastructure outputs..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "trivia-challenge" \
  --query "Stacks[0].Outputs[?OutputKey==\`FrontendBucketName\`].OutputValue" \
  --output text)

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name "trivia-challenge" \
  --query "Stacks[0].Outputs[?OutputKey==\`CloudFrontURL\`].OutputValue" \
  --output text)

VALKEY_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "trivia-challenge" \
  --query "Stacks[0].Outputs[?OutputKey==\`ValkeyEndpoint\`].OutputValue" \
  --output text)

echo "⬆️  Uploading frontend..."
aws s3 cp frontend/index.html "s3://${BUCKET_NAME}/" --content-type "text/html"

echo "🔧 Deploying Lambda function..."
./deploy.sh

echo "✅ Deployment complete!"
echo "🌐 Frontend URL: $CLOUDFRONT_URL"
echo "🔗 API Endpoint: Check API Gateway console"
echo "💾 Valkey Endpoint: $VALKEY_ENDPOINT"
echo ""
echo "🎮 Your trivia app is ready!"
echo "📝 Don't forget to configure GitHub Secrets for CI/CD:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY" 
echo "   - VALKEY_HOST=$VALKEY_ENDPOINT"
echo "   - COGNITO_USER_POOL_ID"
echo "   - COGNITO_CLIENT_ID"