#!/usr/bin/env python3
"""
AWS Trivia Challenge Architecture Diagram
Run: pip install diagrams && python architecture_diagram.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import ElasticacheForRedis
from diagrams import Node
from diagrams.custom import Custom
from diagrams.aws.network import APIGateway, CloudFront, NATGateway, InternetGateway, VPC
from diagrams.aws.storage import S3
from diagrams.aws.security import Cognito

from diagrams.onprem.client import Users
from diagrams.saas.cdn import Cloudflare
from diagrams.programming.framework import React

with Diagram("AWS Trivia Challenge Architecture", show=False, direction="TB", graph_attr={"rankdir": "TB", "ranksep": "1.5"}, edge_attr={"fontsize": "16", "labeldistance": "0.3", "labelangle": "0"}):
    users = Users("Users")
    
    with Cluster("AWS Cloud"):
        # Global services outside VPC
        cloudfront = CloudFront("CloudFront CDN")
        cognito = Cognito("Cognito User Pool")
        s3 = S3("S3 Frontend Bucket")
        
        # Internet Gateway at VPC boundary
        igw = InternetGateway("Internet Gateway")
        
        with Cluster("VPC", graph_attr={"style": "rounded", "bgcolor": "lightblue"}):
            api_gw = APIGateway("API Gateway")
            
            with Cluster("Public Subnet", graph_attr={"rank": "min"}):
                nat = NATGateway("NAT Gateway")
            
            with Cluster("Private Subnet", graph_attr={"rank": "max"}):
                with Cluster("Compute"):
                    lambda_main = Lambda("Game Logic\nLambda")
                    lambda_preloader = Lambda("Question Preloader\nLambda")
                
                with Cluster("Data"):
                    elasticache = Custom("ElastiCache", "./elasticache-serverless-icon.png")
        

    
    with Cluster("External"):
        opentdb = Cloudflare("OpenTDB API")
    
    # User access flow
    users >> cloudfront
    
    # Bidirectional CloudFront and S3 connection
    cloudfront >> s3
    s3 >> Edge(style="dashed") >> cloudfront
    
    # API requests through CloudFront
    cloudfront >> api_gw
    
    # Lambda invocation from API Gateway
    api_gw >> lambda_main
    
    # Authentication flow
    lambda_main >> cognito
    
    # Bidirectional cache operations
    lambda_main >> elasticache
    elasticache >> Edge(style="dashed") >> lambda_main
    
    # Question preloader cache operations
    lambda_preloader >> elasticache
    elasticache >> Edge(style="dashed") >> lambda_preloader
    
    # Complete question preloading flow
    lambda_preloader >> nat
    nat >> igw
    igw >> opentdb
    
    # Response back through same path
    opentdb >> Edge(style="dashed") >> igw
    igw >> Edge(style="dashed") >> nat
    nat >> Edge(style="dashed") >> lambda_preloader
    
    # Internet Gateway to public subnet connection
    igw >> nat
    
