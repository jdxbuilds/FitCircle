import * as path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

export interface FitCircleStackProps extends StackProps {
  stage: 'staging' | 'production';
  /** e.g. api.fitcircle.co — needs certificateArn too. Without it the API is served over plain HTTP on the load balancer address. */
  domainName?: string;
  certificateArn?: string;
  alertEmail?: string;
}

/**
 * FitCircle on AWS:
 *   Load balancer -> API containers (ECS Fargate, 2+ tasks) -> MySQL 8 (RDS)
 *   Proof photos/videos in a private S3 bucket (uploaded directly from phones with signed links)
 *   Scheduled jobs: daily start/settle/payouts, 06:30 and 19:00 reminders (Nairobi time)
 *   Secrets in AWS Secrets Manager; logs in CloudWatch
 */
export class FitCircleStack extends Stack {
  constructor(scope: Construct, id: string, props: FitCircleStackProps) {
    super(scope, id, props);
    const prod = props.stage === 'production';

    // ---------- Network ----------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: prod ? 2 : 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    const appSg = new ec2.SecurityGroup(this, 'AppSg', { vpc, description: 'FitCircle API and jobs' });
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc, description: 'FitCircle MySQL', allowAllOutbound: false });
    dbSg.addIngressRule(appSg, ec2.Port.tcp(3306), 'API and jobs to MySQL');

    // ---------- Database: MySQL 8 ----------
    const params = new rds.ParameterGroup(this, 'DbParams', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_43 }),
      parameters: {
        log_bin_trust_function_creators: '1', // required to create the schema's triggers on RDS
        time_zone: 'Africa/Nairobi',
        require_secure_transport: '1',
      },
    });
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_43 }),
      instanceType: prod ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL) : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret('fitcircle_admin'),
      databaseName: 'fitcircle',
      parameterGroup: params,
      multiAz: prod,
      allocatedStorage: 20,
      maxAllocatedStorage: 200,
      storageEncrypted: true,
      backupRetention: Duration.days(prod ? 14 : 3),
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ['error', 'slowquery'],
    });

    // ---------- Proof storage ----------
    const bucket = new s3.Bucket(this, 'Media', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !prod,
      cors: [{ allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET], allowedOrigins: ['*'], allowedHeaders: ['*'], maxAge: 3000 }],
      lifecycleRules: [
        { prefix: 'proofs/', transitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(60) }] },
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });

    // ---------- Secrets ----------
    const jwt = new secretsmanager.Secret(this, 'JwtSecret', {
      description: 'Signs FitCircle sign-in tokens',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    const callbackToken = new secretsmanager.Secret(this, 'CallbackToken', {
      description: 'Secret path segment in M-Pesa callback URLs',
      generateSecretString: { passwordLength: 40, excludePunctuation: true },
    });
    // Fill these in the AWS console (Secrets Manager) after the first deploy.
    const integrations = new secretsmanager.Secret(this, 'Integrations', {
      description: 'FitCircle provider keys: M-Pesa Daraja, Flutterwave, Africa\'s Talking. Replace every REPLACE_ME.',
      secretObjectValue: Object.fromEntries(
        [
          'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY',
          'MPESA_B2C_SHORTCODE', 'MPESA_B2C_INITIATOR', 'MPESA_B2C_SECURITY_CREDENTIAL',
          'FLW_SECRET_KEY', 'FLW_WEBHOOK_HASH', 'AT_API_KEY',
        ].map((k) => [k, SecretValue.unsafePlainText('REPLACE_ME')]),
      ),
    });
    const field = (s: secretsmanager.ISecret, f?: string) => ecs.Secret.fromSecretsManager(s, f);

    // ---------- Containers ----------
    const image = ecs.ContainerImage.fromAsset(path.join(__dirname, '..', '..'), {
      file: 'backend/Dockerfile',
      platform: Platform.LINUX_AMD64,
    });
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });
    const logGroup = new logs.LogGroup(this, 'Logs', {
      retention: prod ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const logDriver = (prefix: string) => ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: prefix });

    const https = Boolean(props.domainName && props.certificateArn);
    const publicBaseUrl = https ? `https://${props.domainName}` : undefined;

    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '3000',
      DB_HOST: db.dbInstanceEndpointAddress,
      DB_PORT: db.dbInstanceEndpointPort,
      DB_NAME: 'fitcircle',
      DB_SSL: 'rds',
      STORAGE_DRIVER: 's3',
      S3_BUCKET: bucket.bucketName,
      AWS_REGION: this.region,
      PAYMENTS_DRIVER: 'live',
      MPESA_ENV: prod ? 'production' : 'sandbox',
      SMS_DRIVER: 'africastalking',
      AT_USERNAME: prod ? 'fitcircle' : 'sandbox',
      AT_SENDER_ID: prod ? 'FITCIRCLE' : '',
    };
    const secrets: Record<string, ecs.Secret> = {
      DB_USER: field(db.secret!, 'username'),
      DB_PASSWORD: field(db.secret!, 'password'),
      JWT_SECRET: field(jwt),
      MPESA_CALLBACK_TOKEN: field(callbackToken),
      ...Object.fromEntries(
        ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_B2C_SHORTCODE', 'MPESA_B2C_INITIATOR',
          'MPESA_B2C_SECURITY_CREDENTIAL', 'FLW_SECRET_KEY', 'FLW_WEBHOOK_HASH', 'AT_API_KEY'].map((k) => [k, field(integrations, k)]),
      ),
    };

    // ---------- API ----------
    const api = new patterns.ApplicationLoadBalancedFargateService(this, 'Api', {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 2,
      minHealthyPercent: 100,
      securityGroups: [appSg],
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      publicLoadBalancer: true,
      ...(https
        ? {
            protocol: elbv2.ApplicationProtocol.HTTPS,
            certificate: acm.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn!),
            redirectHTTP: true,
          }
        : {}),
      taskImageOptions: {
        image,
        containerPort: 3000,
        logDriver: logDriver('api'),
        environment,
        secrets,
      },
    });
    // The callback URL must be reachable by Safaricom and Flutterwave
    api.taskDefinition.defaultContainer!.addEnvironment('PUBLIC_BASE_URL', publicBaseUrl ?? `http://${api.loadBalancer.loadBalancerDnsName}`);
    api.targetGroup.configureHealthCheck({ path: '/health', healthyHttpCodes: '200', interval: Duration.seconds(20) });
    api.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '20');
    const scaling = api.service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: prod ? 10 : 3 });
    scaling.scaleOnCpuUtilization('Cpu', { targetUtilizationPercent: 60 });
    bucket.grantReadWrite(api.taskDefinition.taskRole);

    // ---------- Scheduled jobs (cron is UTC; Nairobi is UTC+3) ----------
    const job = (id: string, command: string[], schedule: Schedule) => {
      const task = new patterns.ScheduledFargateTask(this, id, {
        cluster,
        schedule,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [appSg],
        scheduledFargateTaskImageOptions: {
          image,
          command,
          cpu: 256,
          memoryLimitMiB: 512,
          logDriver: logDriver(id.toLowerCase()),
          environment: { ...environment, PUBLIC_BASE_URL: publicBaseUrl ?? `http://${api.loadBalancer.loadBalancerDnsName}` },
          secrets,
        },
      });
      bucket.grantReadWrite(task.taskDefinition.taskRole);
      return task;
    };
    job('DailyJob', ['node', 'dist/jobs.js', 'daily'], Schedule.cron({ hour: '21', minute: '5' })); // 00:05 Nairobi
    job('MorningReminder', ['node', 'dist/jobs.js', 'morning'], Schedule.cron({ hour: '3', minute: '30' })); // 06:30
    job('EveningReminder', ['node', 'dist/jobs.js', 'evening'], Schedule.cron({ hour: '16', minute: '0' })); // 19:00

    // One-off task that creates the database schema (run after the first deploy, see outputs)
    const migrate = new ecs.FargateTaskDefinition(this, 'MigrateTask', { cpu: 256, memoryLimitMiB: 512 });
    migrate.addContainer('migrate', {
      image,
      command: ['node', 'dist/migrate.js'],
      logging: logDriver('migrate'),
      environment,
      secrets, // the app's config check needs the full set even though migrate only uses the database
    });

    // ---------- Alerts ----------
    if (props.alertEmail) {
      const topic = new sns.Topic(this, 'Alerts');
      topic.addSubscription(new subs.EmailSubscription(props.alertEmail));
      const alarm = (id: string, metric: cloudwatch.IMetric, threshold: number, desc: string) =>
        new cloudwatch.Alarm(this, id, { metric, threshold, evaluationPeriods: 2, alarmDescription: desc, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING })
          .addAlarmAction(new cwActions.SnsAction(topic));
      alarm('Api5xx', api.loadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5) }), 20, 'API is returning server errors');
      alarm('UnhealthyHosts', api.targetGroup.metrics.unhealthyHostCount({ period: Duration.minutes(1) }), 1, 'An API container is unhealthy');
      alarm('DbCpu', db.metricCPUUtilization({ period: Duration.minutes(5) }), 80, 'Database CPU above 80%');
      new cloudwatch.Alarm(this, 'DbStorage', {
        metric: db.metricFreeStorageSpace({ period: Duration.minutes(15) }),
        threshold: 2 * 1024 ** 3,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        alarmDescription: 'Database has less than 2 GB free',
      }).addAlarmAction(new cwActions.SnsAction(topic));
    }

    // ---------- Outputs ----------
    new CfnOutput(this, 'ApiUrl', { value: publicBaseUrl ?? `http://${api.loadBalancer.loadBalancerDnsName}` });
    new CfnOutput(this, 'MediaBucket', { value: bucket.bucketName });
    new CfnOutput(this, 'IntegrationsSecret', { value: integrations.secretName, description: 'Fill in provider keys here' });
    new CfnOutput(this, 'CallbackTokenSecret', { value: callbackToken.secretName });
    new CfnOutput(this, 'MigrateCommand', {
      description: 'Run once after the first deploy to create the database',
      value: [
        'aws ecs run-task',
        `--cluster ${cluster.clusterName}`,
        `--task-definition ${migrate.taskDefinitionArn}`,
        '--launch-type FARGATE',
        `--network-configuration "awsvpcConfiguration={subnets=[${vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.join(',')}],securityGroups=[${appSg.securityGroupId}]}"`,
      ].join(' '),
    });
  }
}
