# AWS Trivia Challenge Architecture Description

## Sequential Data Flow

**❶ User Access**
- Users access the trivia application through CloudFront CDN

**❷ Static Content Delivery**
- CloudFront serves static files (HTML, CSS, JS) from S3 Frontend Bucket

**❸ API Requests**
- API calls are routed from CloudFront to API Gateway

**❹ Lambda Invocation**
- API Gateway receives requests and invokes Lambda trivia-game function in Private Subnet

**❺ User Authentication**
- Lambda function authenticates users via Cognito User Pool

**❻ Cache Operations**
- Lambda function reads/writes session data and questions to ElastiCache Valkey Serverless

**❼ Question Preloading**
- Lambda question-preloader caches questions in ElastiCache Valkey

**❽-❾ NAT Gateway Routing**
- Lambda functions route through NAT Gateway for internet access

**❿ Internet Gateway**
- NAT Gateway connects to Internet Gateway for external API calls

**⓫ External API Call**
- Internet Gateway routes to OpenTDB API for fresh questions

**⓬-⓭ Response Path**
- OpenTDB API responses flow back through Internet Gateway → NAT Gateway

**⓮-⓯ Monitoring**
- Lambda functions and Valkey send metrics to CloudWatch

**⓰ Alerting**
- CloudWatch triggers SNS alerts for errors/thresholds

## Key Components

- **CloudFront CDN**: Global content delivery and API routing
- **S3 Frontend Bucket**: Static website hosting (HTML, JS, CSS)
- **API Gateway**: REST API endpoint management
- **Lambda Functions**: Serverless compute (trivia-game, question-preloader)
- **ElastiCache Valkey Serverless**: In-memory cache for sessions and questions
- **Cognito User Pool**: User authentication and management
- **NAT Gateway**: Outbound internet access for private Lambda functions
- **CloudWatch**: Monitoring, logging, and alerting
- **SNS Alerts**: Notification system for operational issues