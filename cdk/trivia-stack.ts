import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class TriviaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public/private subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Security Groups
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    const valkeySG = new ec2.SecurityGroup(this, 'ValkeySG', {
      vpc,
      description: 'Security group for Valkey cache',
    });

    valkeySG.addIngressRule(lambdaSG, ec2.Port.tcp(6379), 'Lambda access to Valkey');

    // ElastiCache Valkey Serverless
    const valkeyCache = new elasticache.CfnServerlessCache(this, 'ValkeyCache', {
      serverlessCacheName: `${id}-valkey-cache`,
      engine: 'valkey',
      majorEngineVersion: '7',
      cacheUsageLimits: {
        dataStorage: { maximum: 1, unit: 'GB' },
        ecpuPerSecond: { maximum: 1000 },
      },
      securityGroupIds: [valkeySG.securityGroupId],
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${id}-users`,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },

    });

    const userPoolClient = userPool.addClient('Client', {
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
    });

    // Lambda Functions
    const triviaFunction = new lambda.Function(this, 'TriviaFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('..', {
        exclude: ['cdk/**', 'cdk.out/**', '.git/**', '*.md', '.github/**']
      }),
      vpc,
      securityGroups: [lambdaSG],
      timeout: cdk.Duration.seconds(30),
      environment: {
        VALKEY_HOST: valkeyCache.attrEndpointAddress,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    const preloaderFunction = new lambda.Function(this, 'PreloaderFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'question-preloader.handler',
      code: lambda.Code.fromAsset('..', {
        exclude: ['cdk/**', 'cdk.out/**', '.git/**', '*.md', '.github/**']
      }),
      vpc,
      securityGroups: [lambdaSG],
      timeout: cdk.Duration.minutes(15), // 15 minutes for 10 API calls
      memorySize: 256,
      environment: {
        VALKEY_HOST: valkeyCache.attrEndpointAddress,
      },
    });

    // Grant ElastiCache permissions
    triviaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['elasticache:*'],
      resources: ['*'],
    }));

    // Grant Cognito permissions for username checking
    triviaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers'],
      resources: [userPool.userPoolArn],
    }));

    preloaderFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['elasticache:*'],
      resources: ['*'],
    }));

    // EventBridge rule for weekly schedule (every Monday at 2 AM UTC)
    const weeklyRule = new events.Rule(this, 'WeeklyQuestionRefresh', {
      schedule: events.Schedule.cron({ minute: '0', hour: '2', weekDay: 'MON' }),
      description: 'Trigger weekly question preload every Monday at 2 AM UTC',
    });

    weeklyRule.addTarget(new targets.LambdaFunction(preloaderFunction));

    // API Gateway
    const api = new apigateway.RestApi(this, 'TriviaApi', {
      restApiName: `${id}-api`,
      description: 'Trivia Challenge API',
    });

    const integration = new apigateway.LambdaIntegration(triviaFunction);
    api.root.addMethod('ANY', integration);
    const proxy = api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });
    
    // Enable CORS
    api.root.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    });

    // S3 Frontend Bucket
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${id.toLowerCase()}-frontend-${this.account}-${this.region}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      additionalBehaviors: {
        '/prod/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.domainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ValkeyEndpoint', {
      value: valkeyCache.attrEndpointAddress,
      description: 'Valkey Cache Endpoint',
    });
  }
}