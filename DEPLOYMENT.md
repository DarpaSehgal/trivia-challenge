# Deployment Instructions

## Prerequisites
1. AWS CLI configured with appropriate permissions
2. CloudFormation stack deployed
3. Environment variables set

## Step 1: Deploy Infrastructure
```bash
aws cloudformation deploy \
  --template-file cloudformation.yml \
  --stack-name trivia-challenge \
  --parameter-overrides \
    ValkeySubnetIds=subnet-xxx,subnet-yyy \
    ValkeySecurityGroupId=sg-xxx \
  --capabilities CAPABILITY_IAM
```

## Step 2: Set Environment Variables
```bash
export VALKEY_HOST=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`ValkeyEndpoint`].OutputValue' \
  --output text)

export COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

export COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)
```

## Step 3: Deploy Application
```bash
./deploy-simple.sh
```

## Note
The repository no longer contains hardcoded credentials. All values are now dynamically retrieved from CloudFormation outputs during deployment.