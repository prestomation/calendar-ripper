# Out-of-Band Calendar Sources

Some calendar sources are marked `proxy: "outofband"` because they return
`403 Forbidden` when fetched from GitHub Actions runner IPs but work fine
from a residential IP.

They are **skipped by the main CI build** (`generate-calendars`). Instead, a
cron job on the out-of-band runner runs `npm run generate-outofband`, uploads
the resulting `.ics` files to S3, and the CI build downloads them via
`npm run download-outofband` before publishing.

## How it works

1. **The cron runner** runs `npm run generate-outofband` on a schedule
2. Script rips all outofband sources from a non-blocked IP, writes `.ics` files to `output/`
3. Uploads files + `outofband-report.json` to `s3://calendar-ripper-outofband-220483515252/latest/`
4. **GitHub Actions** runs `npm run download-outofband` which pulls the files into `output/`
5. The main `generate-calendars` script runs, skipping outofband sources, and the downloaded `.ics` files are already in `output/` to be published

## Infrastructure

- **S3 Bucket:** `calendar-ripper-outofband-220483515252` (us-west-2)
- **Secret:** `OUTOFBAND_BUCKET` in GitHub secrets (optional, defaults to bucket name above)
- **AWS credentials:** The cron runner uses default profile; CI uses `AWS_ROLE_ARN` secret
- **CFN template:** `infra/authenticated-proxy/template.yaml`
