# FitCircle on AWS

AWS CDK (TypeScript) describes the whole setup. One command creates it:

```
Phones ──HTTPS──▶ Load balancer ──▶ API containers (ECS Fargate, 2–10) ──▶ MySQL 8 (RDS)
   │                                       │
   └── upload proof directly ──▶ S3 bucket ◀┘     Scheduled jobs: 00:05, 06:30, 19:00 Nairobi time
```

| Piece | Staging | Production |
|---|---|---|
| API containers | 2 × (0.5 vCPU, 1 GB), autoscale to 3 | 2 × same, autoscale to 10 |
| MySQL 8.0 (RDS) | db.t4g.micro, 3-day backups | db.t4g.small, Multi-AZ (two data centres), 14-day backups, deletion protection |
| Network | 1 NAT gateway | 2 NAT gateways |
| Proof storage | S3, private, encrypted | same; bucket is kept if the stack is deleted |
| Alerts | optional | email on API errors, unhealthy containers, DB CPU, low DB storage |

## Rough monthly cost (USD, af-south-1)

- **Staging:** about $110–140.
- **Production:** about $250–350 before traffic.

The biggest fixed costs are the NAT gateways (about $45 each) and the load balancer (about $25). Check the [AWS pricing calculator](https://calculator.aws/) for your region.

## Before the first deploy

1. **AWS account and CLI.** Install the [AWS CLI](https://aws.amazon.com/cli/) and run `aws configure` with an admin user.
2. **Region.** Cape Town (`af-south-1`) is closest to Nairobi. It is opt-in: enable it under *Account → AWS Regions*. Or pass `-c region=eu-west-1`.
3. **Docker** running on your machine. CDK builds the API image from `backend/Dockerfile`.
4. **One-time CDK setup** per account and region: `npx cdk bootstrap`.

## Deploy

```bash
cd infra
npm install
npx cdk deploy -c stage=staging -c alertEmail=you@example.com
```

For production with your domain, first create a certificate for `api.fitcircle.co` in AWS Certificate Manager (same region), then:

```bash
npx cdk deploy -c stage=production -c domainName=api.fitcircle.co \
  -c certificateArn=arn:aws:acm:af-south-1:ACCOUNT:certificate/ID -c alertEmail=you@example.com
```

Point a DNS CNAME for `api.fitcircle.co` at the load balancer address shown in the outputs.

## After the first deploy

1. **Add provider keys.** In *Secrets Manager*, open the secret named in the `IntegrationsSecret` output and replace every `REPLACE_ME`:
   - **M-Pesa Daraja** ([developer.safaricom.co.ke](https://developer.safaricom.co.ke)): consumer key and secret, shortcode, passkey, and the B2C initiator name and security credential for payouts. Sandbox keys work for staging.
   - **Flutterwave:** secret key, plus a webhook secret hash of your choosing.
   - **Africa's Talking:** API key. Staging uses the `sandbox` username.

   Then go to *ECS → Api service → Update → Force new deployment* so the containers pick up the keys. **Until the keys are filled in, sign-in SMS and payments will fail.**
2. **Create the database.** Run the `MigrateCommand` from the outputs. It is safe to run twice.
3. **Register callbacks.**
   - **Flutterwave:** set the webhook URL to `<ApiUrl>/webhooks/flutterwave` with your secret hash.
   - **M-Pesa:** callback URLs are sent with each request automatically.
   - Safaricom requires HTTPS in production, so set up the domain first.
4. **Make yourself an admin.** Sign up in the app, then run `UPDATE users SET role = 'admin' WHERE phone = '+2547...';` on the database, for example through a one-off ECS task or a bastion host.

## Updating

Push code, then run `npx cdk deploy -c stage=...` again. CDK rebuilds the image and rolls the containers one at a time. A failed release rolls back automatically.

Schema changes after launch need a migration plan. `migrate.js` only creates the database when it is empty.

## Known gaps

- **Shared database user:** the app connects as the RDS admin user. Create a dedicated user with only the needed privileges before launch.
- **M-Pesa callbacks** are protected by a secret URL token. For more safety, also restrict `/webhooks/mpesa/*` to Safaricom's published IP ranges with a WAF rule.
- **Sign-out:** sign-in tokens last 30 days and can't be revoked one by one yet. Rotating `JWT_SECRET` signs everyone out.
- **Push notifications** need the mobile app. Notifications are stored and served at `GET /notifications` meanwhile.
