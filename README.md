# 🧠 Serverless Trivia Challenge App

A serverless trivia application built with AWS Lambda and ElastiCache Valkey Serverless, demonstrating real-world integration patterns and Valkey's key features.

> **CDK Deployment Ready** - Now with proper IAM permissions configured

## 🏗️ Architecture

![AWS Trivia Challenge Architecture](architecture/aws_trivia_challenge_architecture.png)

### Architecture Overview
The application follows a serverless architecture pattern with the following key components:

- **CloudFront CDN**: Global content delivery and API routing
- **S3 Frontend Bucket**: Static website hosting (HTML, JS, CSS)
- **API Gateway**: REST API endpoint management
- **Lambda Functions**: Serverless compute (trivia-game, question-preloader)
- **ElastiCache Valkey Serverless**: In-memory cache for sessions and questions
- **Cognito User Pool**: User authentication and management
- **VPC with Public/Private Subnets**: Network isolation and security
- **NAT Gateway**: Outbound internet access for private Lambda functions
- **CloudWatch & SNS**: Monitoring, logging, and alerting

For detailed data flow description, see [Architecture Documentation](architecture/architecture_description.md).

## 🚀 Quick Deploy (CDK)

### One-Command Deployment
```bash
# Install CDK globally
npm install -g aws-cdk

# Deploy the stack
cd cdk
npm install
npx cdk bootstrap  # First time only
npx cdk deploy
```

### Fork & Deploy via GitHub Actions
1. Fork this repository
2. Set AWS credentials in GitHub Secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
3. Push to main branch - automatic deployment via `.github/workflows/deploy-cdk.yml`

## 🛠️ Manual Setup (Advanced)

### Prerequisites
- AWS CLI configured
- Node.js 18+

### 1. Install Dependencies
```bash
npm install
```

### 2. Deploy Infrastructure (CDK)
```bash
cd cdk
npm install
npx cdk bootstrap  # First time only
npx cdk deploy
```

### 3. Get Application URL
```bash
# CDK automatically deploys Lambda code
aws cloudformation describe-stacks \
  --stack-name TriviaChallenge \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text
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

### Environment Variables (Auto-configured)
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

## 🧪 Local Development

### Using CDK Local Development
```bash
# Watch for changes and auto-deploy
cd cdk
npx cdk watch

# Or synthesize CloudFormation template
npx cdk synth
```

### Mock Data
The frontend includes mock data for testing without full AWS setup.

## 📈 Performance Optimizations

1. **Question Pre-loading**: Scheduled Lambda runs every 6 hours
2. **Connection Reuse**: Persistent Valkey connections
3. **TTL Management**: Automatic cleanup of expired data
4. **Batch Operations**: Efficient Redis commands

## 🔒 Security Features

- **VPC Isolation**: Lambda functions in private subnets
- **TLS Encryption**: All data in transit encrypted
- **IAM Roles**: Least privilege access
- **Security Groups**: Network-level firewall rules
- **Cognito Authentication**: JWT token validation

## 🗂️ Project Structure

```
├── architecture/              # Architecture diagrams and docs
├── cdk/                      # CDK infrastructure code
│   ├── trivia-stack.ts       # Main CDK stack definition
│   ├── app.ts               # CDK app entry point
│   └── package.json         # CDK dependencies
├── frontend/                 # Static web files
├── .github/workflows/        # CI/CD pipelines
├── cloudformation.yml        # Legacy template (requires existing resources)
├── index.js                  # Main Lambda function
├── valkey-client.js         # Valkey connection and operations
├── question-service.js      # OpenTDB API integration
└── README.md                # This file
```

## 📝 License

MIT License - feel free to use this for learning and development!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Built with ❤️ using AWS Lambda and ElastiCache Valkey Serverless**