# 🧠 Serverless Trivia Challenge App

A serverless trivia application built with AWS Lambda and ElastiCache Valkey Serverless, demonstrating real-world integration patterns and Valkey's key features.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React/HTML    │    │   API Gateway    │    │  AWS Lambda     │
│   Frontend      │◄──►│  + Cognito Auth  │◄──►│  (Node.js)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                       ┌──────────────────┐             │
                       │   OpenTDB API    │◄────────────┤
                       │  (Questions)     │             │
                       └──────────────────┘             │
                                                         │
                       ┌──────────────────┐             │
                       │ ElastiCache      │◄────────────┘
                       │ Valkey Serverless│
                       │ - Questions Cache│
                       │ - User Sessions  │
                       │ - Leaderboards   │
                       │ - Seen Questions │
                       └──────────────────┘
```

## ✨ Features

### 🎯 Core Functionality
- **User Authentication**: AWS Cognito integration
- **5-Question Sessions**: Trivia from OpenTDB API
- **Smart Caching**: Questions cached in Valkey with TTL
- **Duplicate Prevention**: Track seen questions per user
- **Speed Scoring**: Bonus points for quick answers (10 + max(0, 5 - time_taken))

### 🏆 Leaderboard System
- **Weekly Rankings**: Sorted sets in Valkey
- **Automatic Cleanup**: TTL-based data expiry
- **Top 10 Display**: Current week's best players

### 🔧 Valkey Integration Patterns
- **Caching**: `valkey:questions:<category>`
- **Session Management**: `valkey:session:<uuid>`
- **User Tracking**: `valkey:user:<id>:seen_questions`
- **Leaderboards**: `valkey:leaderboard:<year>-<week>`

## 🚀 Quick Start

### Prerequisites
- AWS CLI configured
- Node.js 18+
- Serverless Framework (optional)

### 1. Install Dependencies
```bash
npm install
```

### 2. Deploy Infrastructure
```bash
aws cloudformation deploy \
  --template-file cloudformation.yml \
  --stack-name trivia-challenge \
  --parameter-overrides \
    ValkeySubnetIds=subnet-xxx,subnet-yyy \
    ValkeySecurityGroupId=sg-xxx \
  --capabilities CAPABILITY_IAM
```

### 3. Deploy Frontend
```bash
# Get S3 bucket name from CloudFormation
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

# Upload frontend to S3
aws s3 cp frontend/index.html s3://$BUCKET_NAME/ --content-type "text/html"

# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name trivia-challenge \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text)

echo "🎉 App deployed at: $CLOUDFRONT_URL"
```

### 4. Configure Environment
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

### 5. Deploy Lambda Functions
```bash
# Using Serverless Framework
serverless deploy

# Or zip and upload manually
zip -r trivia-app.zip . -x "*.git*" "node_modules/.cache/*"
aws lambda update-function-code \
  --function-name trivia-game \
  --zip-file fileb://trivia-app.zip
```

### 6. Test the Application
```bash
# Open frontend/index.html in browser
# Or serve locally:
cd frontend && python3 -m http.server 8000
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/start-game` | Initialize new trivia session |
| POST | `/submit-answer` | Submit answer and get next question |
| POST | `/end-session` | Complete session and update leaderboard |
| GET | `/leaderboard` | Get current week's top 10 players |

### Example Requests

**Start Game:**
```json
POST /start-game
{
  "category": "general"
}
```

**Submit Answer:**
```json
POST /submit-answer
{
  "sessionId": "uuid-here",
  "questionId": "question-id",
  "answer": "Selected Answer",
  "timeTaken": 3.2
}
```

## 🔧 Configuration

### Environment Variables
- `VALKEY_HOST`: ElastiCache Valkey endpoint
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `COGNITO_CLIENT_ID`: Cognito Client ID

### Valkey Data Structure
```
valkey:questions:general          # Cached questions by category
valkey:user:123:seen_questions    # Set of seen question IDs
valkey:session:uuid-123           # Temporary session data
valkey:leaderboard:2024-12        # Weekly sorted set
```

## 🧪 Testing & Development

### Local Development
```bash
# Install serverless-offline for local testing
npm install -g serverless-offline
serverless offline start
```

### Mock Data
The frontend includes mock data for testing without full AWS setup.

### Multi-AZ Configuration
Update CloudFormation template to specify multiple subnet IDs for high availability:
```yaml
ValkeySubnetIds:
  Type: CommaDelimitedList
  Default: "subnet-12345,subnet-67890,subnet-abcde"
```

## 📈 Performance Optimizations

1. **Question Pre-loading**: Scheduled Lambda runs every 6 hours
2. **Connection Reuse**: Persistent Valkey connections
3. **TTL Management**: Automatic cleanup of expired data
4. **Batch Operations**: Efficient Redis commands

## 🔒 Security Features

- **Cognito Authentication**: JWT token validation
- **VPC Security**: Valkey in private subnets
- **CORS Configuration**: Proper cross-origin setup
- **Input Validation**: Sanitized user inputs

## 📝 License

MIT License - feel free to use this for learning and development!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Built with ❤️ using AWS Lambda and ElastiCache Valkey Serverless**# Deployment ready
# Deployment ready with GitHub Secrets configured
