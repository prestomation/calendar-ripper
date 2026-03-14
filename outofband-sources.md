# Out-of-Band Sources

These calendar sources are marked `proxy: "outofband"` because they return
`403 Forbidden` when fetched from GitHub Actions runner IPs but work fine
from a residential/home IP (OpenClaw).

They are **skipped by the main CI build** (`generate-calendars`). Instead, a
cron job on OpenClaw runs `npm run generate-outofband`, uploads the resulting
`.ics` files to S3, and the CI build downloads them via
`npm run download-outofband` before publishing.

## Sources

| Source | Why outofband |
|---|---|
| **AMC Theatres** (`sources/amc/`) | AMC's GraphQL API (`graph.amctheatres.com`) blocks AWS/GitHub runner IPs |
| **Seattle Art Museum** (`sources/sam/`) | SAM website blocks non-residential IPs |
| **Rainier Arts Center** (`sources/rainier_arts_center/`) | Blocks GitHub Actions IPs |
| **The 5th Avenue Theatre** (`sources/5thavenue/`) | AXS venue — AXS blocks GitHub runner IPs |
| **Barboza** (`sources/barboza/`) | AXS venue — AXS blocks GitHub runner IPs |
| **Clock-Out Lounge** (`sources/clockout_lounge/`) | AXS venue — AXS blocks GitHub runner IPs |
| **Neumos** (`sources/neumos/`) | AXS venue — AXS blocks GitHub runner IPs |

## How it works

1. **OpenClaw cron job** runs `npm run generate-outofband` on a schedule
2. Script rips all outofband sources from the home IP, writes `.ics` files to `output/`
3. Uploads files + `outofband-report.json` to `s3://calendar-ripper-outofband-220483515252/latest/`
4. **GitHub Actions** runs `npm run download-outofband` which pulls the files into `output/`
5. The main `generate-calendars` script runs, skipping outofband sources, and the downloaded `.ics` files are already in `output/` to be published

## Infrastructure

- **S3 Bucket:** `calendar-ripper-outofband-220483515252` (us-west-2)
- **Secret:** `OUTOFBAND_BUCKET` in GitHub secrets (optional, defaults to bucket name above)
- **AWS credentials:** OpenClaw uses default profile; CI uses `AWS_ROLE_ARN` secret
