# 🧠 Serverless Trivia Challenge App

A serverless trivia application built with AWS Lambda and ElastiCache Valkey Serverless, demonstrating real-world integration patterns and Valkey's key features.

> **CDK Deployment Ready** - Now with proper IAM permissions configured

## 🏗️ Architecture

![AWS Trivia Challenge Architecture](architecture/aws_trivia_challenge_architecture.png)

### Architecture Overview
The application follows a serverless architecture pattern with proper AWS component placement and clear data flow visualization:

**Global Services:**
- **CloudFront CDN**: Global content delivery with bidirectional S3 connection
- **S3 Frontend Bucket**: Static website hosting (single-page vanilla HTML/CSS/JavaScript)
- **Cognito User Pool**: Direct user authentication with JWT token management
- **API Gateway**: REST API endpoint management (AWS managed service)
- **EventBridge**: Scheduled event management for question preloading

**VPC Architecture:**
- **Internet Gateway**: VPC boundary component for external connectivity
- **Public Subnet**: Contains NAT Gateway for outbound internet access
- **Private Subnet**: Isolated Lambda functions and ElastiCache for security
- **Lambda Functions**: Game Logic and Question Preloader with bidirectional ElastiCache connections
- **ElastiCache Serverless**: In-memory cache with complete data flow integration

**External Integration:**
- **OpenTDB API**: Complete question fetching flow through NAT Gateway and Internet Gateway

**Data Flow Legend:**
- **Solid arrows**: Primary data flows (requests, API calls)
- **Dashed arrows**: Response flows (data returning)
- **Dotted arrows**: Authentication flows (user login/tokens)
- **Bold arrows**: Scheduled events (EventBridge triggers)

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
- **Smart Caching**: Questions cached in ElastiCache with TTL and HTML entity decoding
- **Duplicate Prevention**: Track seen questions per user
- **Speed Scoring**: Bonus points for quick answers (10 + max(0, 5 - time_taken))

### 🏆 Leaderboard System
- **Weekly Rankings**: Sorted sets in Valkey
- **Automatic Cleanup**: TTL-based data expiry
- **Top 10 Display**: Current week's best players

### 🔧 ElastiCache Integration Patterns
- **Question Caching**: `valkey:weekly_questions:<year>-W<week>` (500 questions loaded weekly)
- **Session Management**: `valkey:session:<uuid>` (Hash structure with TTL)
- **User Tracking**: `valkey:user:<id>:seen_questions` (Set with 7-day TTL)
- **Leaderboards**: `valkey:leaderboard:<year>-<week>` (Sorted sets with 8-week TTL)

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
- `VALKEY_HOST`: ElastiCache Serverless endpoint
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `COGNITO_CLIENT_ID`: Cognito Client ID

### ElastiCache Data Structure
```
valkey:weekly_questions:2025-W36  # 500 pre-loaded questions (weekly refresh)
valkey:user:123:seen_questions     # Set of seen question IDs (7-day TTL)
valkey:session:uuid-123            # Hash: userId, score, currentQuestion (1-hour TTL)
valkey:leaderboard:2025-W36        # Sorted set: userId:username → score (8-week TTL)
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

1. **Question Pre-loading**: 500 questions loaded weekly via Lambda (manual trigger)
2. **HTML Entity Decoding**: Clean text processing (&quot; → ", &#039; → ', &ouml; → ö)
3. **Connection Reuse**: Persistent ElastiCache connections in Lambda
4. **TTL Management**: Automatic cleanup of expired sessions, user state, and leaderboards
5. **Batch Operations**: Efficient Redis-compatible commands

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