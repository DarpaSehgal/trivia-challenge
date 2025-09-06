#!/usr/bin/env python3
"""
AWS Trivia Challenge Architecture Diagram
Run: pip install diagrams && python architecture_diagram.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Database
from diagrams.aws.network import APIGateway, CloudFront, NATGateway, InternetGateway, VPC
from diagrams.aws.storage import S3
from diagrams.aws.security import Cognito
from diagrams.aws.management import Cloudwatch
from diagrams.aws.integration import SNS
from diagrams.onprem.client import Users
from diagrams.saas.cdn import Cloudflare
from diagrams.programming.framework import React

with Diagram("AWS Trivia Challenge Architecture", show=False, direction="TB", graph_attr={"rankdir": "TB", "ranksep": "1.5"}, edge_attr={"fontsize": "16", "labeldistance": "0.3", "labelangle": "0"}):
    users = Users("Users")
    
    with Cluster("AWS Cloud"):
        with Cluster("Global Services"):
            cloudfront = CloudFront("CloudFront CDN")
            cognito = Cognito("Cognito User Pool")
        
        with Cluster("VPC (us-west-2)", graph_attr={"style": "rounded", "bgcolor": "lightblue"}):
            api_gw = APIGateway("API Gateway")
            
            with Cluster("Public Subnets", graph_attr={"rank": "min"}):
                igw = InternetGateway("Internet Gateway")
                nat = NATGateway("NAT Gateway")
            
            with Cluster("Private Subnets", graph_attr={"rank": "max"}):
                with Cluster("Compute"):
                    lambda_main = Lambda("Game Logic\nLambda")
                    lambda_preloader = Lambda("Question Preloader\nLambda")
                
                with Cluster("Data"):
                    elasticache = Database("ElastiCache")
        
        s3 = S3("S3 Frontend Bucket")
        
        with Cluster("Monitoring"):
            cloudwatch = Cloudwatch("CloudWatch")
            sns = SNS("SNS Alerts")
    
    with Cluster("External"):
        opentdb = Cloudflare("OpenTDB API")
    
    # User access
    users >> cloudfront
    
    # Static content delivery
    cloudfront >> s3
    
    # API requests
    cloudfront >> api_gw
    
    # Lambda invocation
    api_gw >> lambda_main
    
    # Authentication
    lambda_main >> cognito
    
    # Cache operations
    lambda_main >> elasticache
    
    # Question preloading
    lambda_preloader >> elasticache
    
    # Question preloading from external API
    lambda_preloader >> nat
    nat >> igw
    igw >> opentdb
    
    # Response back to preloader
    opentdb >> Edge(style="dashed") >> igw
    igw >> Edge(style="dashed") >> nat
    
    # Monitoring and alerting
    lambda_main >> cloudwatch
    lambda_preloader >> cloudwatch
    elasticache >> cloudwatch
    cloudwatch >> sns