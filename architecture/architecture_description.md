# AWS Trivia Challenge Architecture Description

![AWS Trivia Challenge Architecture](aws_trivia_challenge_architecture.png)

## Sequential Data Flow

The numbered flow in the diagram shows the complete user journey:

**❶ User Access**
- Users access the trivia application through CloudFront CDN for global performance and low latency

**❷ Static Content Delivery**
- CloudFront serves static files (HTML, CSS, JS) from S3 Frontend Bucket with edge caching

**❸ API Requests**
- API calls are routed from CloudFront to API Gateway for serverless processing and authentication

**❹ Lambda Invocation**
- API Gateway receives requests and invokes the trivia-game Lambda function in private subnets for security

**❺ User Authentication**
- Lambda function authenticates users via Cognito User Pool for secure access and JWT token validation

**❻ Cache Operations**
- Lambda reads/writes session data and questions to ElastiCache Valkey Serverless for fast data access

**❼ Question Preloading**
- Separate Lambda question-preloader function caches fresh questions from external API proactively

**❽-❾ NAT Gateway Routing**
- Lambda functions route through NAT Gateway for secure internet access from private subnets

**❿ Internet Gateway**
- NAT Gateway connects to Internet Gateway for external API calls while maintaining security

**⓫ External API Call**
- Fetches trivia questions from OpenTDB API when cache needs refresh or new categories

**⓬-⓭ Response Path**
- OpenTDB API responses flow back through the same secure network path (Internet Gateway → NAT Gateway)

**⓮-⓯ Monitoring**
- Lambda functions and Valkey send performance metrics, logs, and health data to CloudWatch

**⓰ Alerting**
- CloudWatch triggers SNS alerts for operational issues, error thresholds, and performance anomalies

## Key Components

- **CloudFront CDN**: Global content delivery and API routing with edge locations
- **S3 Frontend Bucket**: Static website hosting with encryption and lifecycle policies
- **API Gateway**: REST API endpoint management with throttling and CORS
- **Lambda Functions**: Serverless compute with VPC configuration and environment variables
- **ElastiCache Valkey Serverless**: In-memory cache with TLS encryption and automatic scaling
- **Cognito User Pool**: User authentication with JWT tokens and password policies
- **VPC with Subnets**: Network isolation with public/private subnet separation
- **NAT Gateway**: Outbound internet access for private resources with high availability
- **Internet Gateway**: VPC internet connectivity for public resources
- **CloudWatch**: Comprehensive monitoring, logging, and metrics collection
- **SNS Alerts**: Notification system for operational events and threshold breaches

## Security Architecture

- **Private Subnets**: Lambda functions and Valkey cache isolated from direct internet access
- **Public Subnets**: NAT Gateway and Internet Gateway for controlled internet connectivity
- **Security Groups**: Network-level firewall rules controlling traffic between components
- **TLS Encryption**: All data in transit encrypted using TLS 1.2+ protocols
- **VPC Isolation**: Complete network separation from other AWS resources
- **IAM Roles**: Least privilege access for Lambda functions and AWS services

## Data Flow Patterns

1. **User Interaction Flow**: User → CloudFront → S3/API Gateway → Lambda → Response
2. **Authentication Flow**: Lambda → Cognito → JWT Validation → Session Management
3. **Caching Flow**: Lambda → Valkey → Cache Hit/Miss → Data Retrieval/Storage
4. **External API Flow**: Lambda → NAT → Internet Gateway → OpenTDB API → Response
5. **Monitoring Flow**: All Components → CloudWatch → Metrics/Logs → SNS Alerts