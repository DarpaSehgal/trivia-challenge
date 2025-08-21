#!/usr/bin/env python3
"""
AWS Trivia Challenge Architecture Diagram
Run: pip install diagrams && python architecture_diagram.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import ElasticacheForRedis
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
                    lambda_main = Lambda("Lambda\ntrivia-game")
                    lambda_preloader = Lambda("Lambda\nquestion-preloader")
                
                with Cluster("Data"):
                    valkey = ElasticacheForRedis("ElastiCache\nValkey Serverless")
        
        s3 = S3("S3 Frontend Bucket")
        
        with Cluster("Monitoring"):
            cloudwatch = Cloudwatch("CloudWatch")
            sns = SNS("SNS Alerts")
    
    with Cluster("External"):
        opentdb = Cloudflare("OpenTDB API")
    
    # 1. User access
    users >> Edge(label="❶") >> cloudfront
    
    # 2. Static content delivery
    cloudfront >> Edge(label="❷") >> s3
    
    # 3. API requests
    cloudfront >> Edge(label="❸", minlen="1") >> api_gw
    
    # 4. Lambda invocation
    api_gw >> Edge(label="❹") >> lambda_main
    
    # 5. Authentication
    lambda_main >> Edge(label="❺", minlen="1") >> cognito
    
    # 6. Cache operations
    lambda_main >> Edge(label="❻") >> valkey
    
    # 7. Question preloading
    lambda_preloader >> Edge(label="❼") >> valkey
    
    # 8-11. External API calls (when cache miss)
    lambda_main >> Edge(label="❽") >> nat
    lambda_preloader >> Edge(label="❾") >> nat
    nat >> Edge(label="❿") >> igw
    igw >> Edge(label="⓫") >> opentdb
    
    # 12-13. Response back
    opentdb >> Edge(label="⓬", style="dashed") >> igw
    igw >> Edge(label="⓭", style="dashed") >> nat
    
    # 14-15. Monitoring
    lambda_main >> Edge(label="⓮", minlen="1") >> cloudwatch
    valkey >> Edge(label="⓯") >> cloudwatch
    cloudwatch >> Edge(label="⓰") >> sns