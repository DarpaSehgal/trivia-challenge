# AWS Trivia Challenge Architecture Description

![AWS Trivia Challenge Architecture](aws_trivia_challenge_architecture.png)

## Complete Data Flow Architecture

The improved architecture demonstrates proper AWS component placement and complete data flows:

**User Interaction Flow**
- Users access the trivia application through CloudFront CDN for global performance
- CloudFront maintains bidirectional connection with S3 for content delivery and caching
- API requests route from CloudFront directly to API Gateway within the VPC

**Authentication and Processing**
- API Gateway invokes Game Logic Lambda function in private subnet for security
- Lambda function authenticates users via Cognito User Pool (global service)
- Bidirectional data flow between Lambda functions and ElastiCache for session management

**Question Management System**
- Question Preloader Lambda maintains bidirectional connection with ElastiCache
- Complete external API flow: Preloader → NAT Gateway → Internet Gateway → OpenTDB API
- Response path: OpenTDB → Internet Gateway → NAT Gateway → Preloader Lambda
- HTML entity decoding and data processing before cache storage

**Network Architecture**
- Internet Gateway positioned at VPC boundary (not within subnets)
- NAT Gateway in public subnet for outbound internet access
- Lambda functions and ElastiCache isolated in private subnet
- Proper separation of global services (CloudFront, Cognito, S3) from VPC components

## Architectural Components by Layer

**Global Services Layer:**
- **CloudFront CDN**: Global content delivery with bidirectional S3 integration
- **S3 Frontend Bucket**: Static website hosting with CloudFront caching
- **Cognito User Pool**: User authentication service with JWT token management

**VPC Network Layer:**
- **Internet Gateway**: VPC boundary component for external connectivity
- **Public Subnet**: Contains NAT Gateway for secure outbound internet access
- **Private Subnet**: Isolated compute and data layer for security
- **NAT Gateway**: High availability outbound internet access for private resources

**Application Layer:**
- **API Gateway**: REST API endpoint management with CloudFront integration
- **Game Logic Lambda**: Main application logic with bidirectional ElastiCache connection
- **Question Preloader Lambda**: Background service with complete external API flow
- **ElastiCache Serverless**: In-memory cache with bidirectional Lambda connections

**External Integration:**
- **OpenTDB API**: External trivia source accessed through complete network path

## Security Architecture

- **Private Subnets**: Lambda functions and Valkey cache isolated from direct internet access
- **Public Subnets**: NAT Gateway and Internet Gateway for controlled internet connectivity
- **Security Groups**: Network-level firewall rules controlling traffic between components
- **TLS Encryption**: All data in transit encrypted using TLS 1.2+ protocols
- **VPC Isolation**: Complete network separation from other AWS resources
- **IAM Roles**: Least privilege access for Lambda functions and AWS services

## Data Flow Patterns

1. **Complete User Flow**: User → CloudFront ↔ S3 (bidirectional) + CloudFront → API Gateway → Lambda → Response
2. **Authentication Flow**: Lambda → Cognito (global service) → JWT Validation → Session Management
3. **Bidirectional Caching**: Lambda ↔ ElastiCache (read/write operations for both Lambda functions)
4. **Complete External API Flow**: Preloader Lambda → NAT Gateway → Internet Gateway → OpenTDB API → Return Path → HTML Entity Processing
5. **Network Isolation**: Internet Gateway at VPC boundary → Public Subnet (NAT) → Private Subnet (Lambda/ElastiCache)