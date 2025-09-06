# AWS Trivia Challenge Architecture Description

![AWS Trivia Challenge Architecture](aws_trivia_challenge_architecture.png)

## Data Flow Overview

The architecture demonstrates a complete serverless trivia application with the following flow:

**User Access**
- Users access the trivia application through CloudFront CDN for global performance and low latency

**Static Content Delivery**
- CloudFront serves static files (HTML, CSS, JS) from S3 Frontend Bucket with edge caching

**API Requests**
- API calls are routed from CloudFront to API Gateway for serverless processing and authentication

**Lambda Invocation**
- API Gateway receives requests and invokes the Game Logic Lambda function in private subnets for security

**User Authentication**
- Lambda function authenticates users via Cognito User Pool for secure access and JWT token validation

**Cache Operations**
- Lambda reads/writes session data and questions to ElastiCache Serverless for fast data access

**Question Preloading**
- Separate Question Preloader Lambda function caches fresh questions from external API proactively

**External API Integration**
- Lambda functions route through NAT Gateway and Internet Gateway for secure external API calls
- Fetches trivia questions from OpenTDB API with comprehensive HTML entity decoding
- Responses flow back through the same secure network path

## Key Components

- **CloudFront CDN**: Global content delivery and API routing with edge locations
- **S3 Frontend Bucket**: Static website hosting with encryption and lifecycle policies
- **API Gateway**: REST API endpoint management with throttling and CORS
- **Lambda Functions**: Serverless compute with VPC configuration and environment variables
- **ElastiCache Serverless**: In-memory cache with TLS encryption and automatic scaling
- **Cognito User Pool**: User authentication with JWT tokens and password policies
- **VPC with Subnets**: Network isolation with public/private subnet separation
- **NAT Gateway**: Outbound internet access for private resources with high availability
- **Internet Gateway**: VPC internet connectivity for public resources
- **OpenTDB API**: External trivia question source with HTML entity processing

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
3. **Caching Flow**: Lambda → ElastiCache → Cache Hit/Miss → Data Retrieval/Storage
4. **External API Flow**: Lambda → NAT → Internet Gateway → OpenTDB API → HTML Entity Decoding → Response
5. **Question Preloading Flow**: Scheduled Lambda → External API → Data Processing → Cache Storage