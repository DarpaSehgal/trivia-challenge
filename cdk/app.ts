#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TriviaStack } from './trivia-stack';

const app = new cdk.App();
new TriviaStack(app, 'TriviaChallenge', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
});