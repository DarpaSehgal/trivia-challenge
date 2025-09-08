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
from diagrams.aws.integration import Eventbridge
from diagrams.onprem.client import Users
from diagrams.saas.cdn import Cloudflare

with Diagram("AWS Trivia Challenge Architecture", show=False, direction="TB", graph_attr={"rankdir": "TB", "ranksep": "1.5"}, edge_attr={"fontsize": "16", "labeldistance": "0.3", "labelangle": "0"}):
    users = Users("Users")
    
    with Cluster("AWS Cloud"):
        # Global services outside VPC
        cloudfront = CloudFront("CloudFront CDN")
        cognito = Cognito("Cognito User Pool")
        s3 = S3("S3 Frontend Bucket")
        api_gw = APIGateway("API Gateway")
        eventbridge = Eventbridge("EventBridge")
        
        # Internet Gateway at VPC boundary
        igw = InternetGateway("Internet Gateway")
        
        with Cluster("VPC", graph_attr={"style": "rounded", "bgcolor": "lightblue"}):
            
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
    
    # Bidirectional user access flow
    users >> cloudfront
    cloudfront >> Edge(style="dashed") >> users
    
    # Bidirectional CloudFront and S3 connection
    cloudfront >> s3
    s3 >> Edge(style="dashed") >> cloudfront
    
    # Direct authentication flow (dotted for auth)
    users >> Edge(style="dotted") >> cognito
    cognito >> Edge(style="dotted") >> users
    
    # API requests through CloudFront
    cloudfront >> api_gw
    
    # Bidirectional Lambda and API Gateway
    api_gw >> lambda_main
    lambda_main >> Edge(style="dashed") >> api_gw
    
    # Bidirectional cache operations
    lambda_main >> elasticache
    elasticache >> Edge(style="dashed") >> lambda_main
    
    # Question preloader cache operations
    lambda_preloader >> elasticache
    elasticache >> Edge(style="dashed") >> lambda_preloader
    
    # Scheduled event flow (bold for events)
    eventbridge >> Edge(style="bold") >> lambda_preloader
    
    # Complete question preloading flow
    lambda_preloader >> nat
    nat >> igw
    igw >> opentdb
    
    # Response back through same path
    opentdb >> Edge(style="dashed") >> igw
    igw >> Edge(style="dashed") >> nat
    nat >> Edge(style="dashed") >> lambda_preloader
    
    # Legend (using invisible nodes for positioning)
    with Cluster("Legend", graph_attr={"style": "rounded", "bgcolor": "lightyellow"}):
        from diagrams import Node
        legend1 = Node("Primary Data Flow", shape="plaintext")
        legend2 = Node("Response/Return Flow", shape="plaintext")
        legend3 = Node("Authentication Flow", shape="plaintext")
        legend4 = Node("Scheduled Events", shape="plaintext")
        
        # Legend arrows
        legend1 >> Edge(label="") >> Node("", shape="point", width="0")
        legend2 >> Edge(style="dashed", label="") >> Node("", shape="point", width="0")
        legend3 >> Edge(style="dotted", label="") >> Node("", shape="point", width="0")
        legend4 >> Edge(style="bold", label="") >> Node("", shape="point", width="0")
    
