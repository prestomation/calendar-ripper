# Authenticated Proxy

A Lambda Function URL that proxies HTTP requests from AWS IPs, bypassing IP-based blocking that affects GitHub Actions runners (e.g., Cloudflare 403s on AXS and AMC).

## Architecture

```
GitHub Actions ──SigV4──▶ Lambda Function URL ──fetch──▶ upstream site
      │                        (AWS IP)
      │
      └── assumes IAM role via OIDC (no long-lived credentials)
```

The proxy is transparent — callers make the same HTTP request they would make to the upstream, just pointed at the proxy with `?url=<target>`:

```
POST https://<proxy-url>/?url=https://graph.amctheatres.com/graphql
Content-Type: application/json
Origin: https://www.amctheatres.com

{"query": "{ viewer { theatre(slug: \"test\") { name } } }"}
```

The proxy:
- Passes through the HTTP verb, body, and application headers
- Strips AWS infrastructure headers (`authorization`, `x-amz-*`, `x-forwarded-*`, `host`, `content-length`)
- Returns the upstream status code, headers, and body directly
- Validates the target domain against a configurable allowlist

## Resources Created

| Resource | Purpose |
|---|---|
| `AWS::IAM::OIDCProvider` | GitHub Actions OIDC federation (one per account) |
| `AWS::IAM::Role` (GitHub Actions) | Assumed by workflows via OIDC; has `lambda:InvokeFunctionUrl` |
| `AWS::IAM::Role` (Lambda exec) | Basic Lambda execution + CloudWatch Logs |
| `AWS::Lambda::Function` | The proxy handler (Node.js 20, inline code) |
| `AWS::Lambda::Url` | Function URL with `AWS_IAM` auth type |

## Deploying

```bash
aws cloudformation deploy \
  --template-file infra/authenticated-proxy/template.yaml \
  --stack-name calendar-ripper-proxy \
  --parameter-overrides \
    GitHubOrg=prestomation \
    GitHubRepo=calendar-ripper \
    AllowedTargetDomains="www.axs.com,graph.amctheatres.com" \
  --capabilities CAPABILITY_NAMED_IAM
```

Save the stack outputs as GitHub Actions secrets:

| Output | GitHub Secret |
|---|---|
| `ProxyFunctionUrl` | `PROXY_URL` |
| `GitHubActionsRoleArn` | `AWS_ROLE_ARN` |

## Using in GitHub Actions

Add these steps before calendar generation:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: us-west-2

- name: Generate calendars
  env:
    PROXY_URL: ${{ secrets.PROXY_URL }}
```

Then in any `ripper.yaml`, enable the proxy:

```yaml
name: amc
proxy: true
url: "https://graph.amctheatres.com/graphql"
# ...
```

When `proxy: true` and the `PROXY_URL` environment variable is set, all HTTP requests for that ripper are routed through the Lambda proxy. If `PROXY_URL` is not set (e.g., local development), requests go directly to the upstream.

## Files

| File | Purpose |
|---|---|
| `template.yaml` | CloudFormation template |
| `handler.ts` | TypeScript source for the Lambda handler (tested) |
| `handler.test.ts` | Unit tests for the handler |

The inline JavaScript in `template.yaml` is a compact equivalent of `handler.ts`. Keep them in sync when making changes.

## Testing

```bash
npx vitest run infra/authenticated-proxy/handler.test.ts
```
