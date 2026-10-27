#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { FitCircleStack } from '../lib/fitcircle-stack';

const app = new App();
const stage = (app.node.tryGetContext('stage') ?? 'staging') as 'staging' | 'production';

new FitCircleStack(app, stage === 'production' ? 'FitCircle-Production' : 'FitCircle-Staging', {
  stage,
  domainName: app.node.tryGetContext('domainName'),
  certificateArn: app.node.tryGetContext('certificateArn'),
  alertEmail: app.node.tryGetContext('alertEmail'),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Cape Town is the closest AWS region to Nairobi (enable it in your account first), or use eu-west-1.
    region: app.node.tryGetContext('region') ?? process.env.CDK_DEFAULT_REGION ?? 'af-south-1',
  },
  tags: { project: 'fitcircle', stage },
});
