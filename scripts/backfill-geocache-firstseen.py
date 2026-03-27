#!/usr/bin/env python3
"""
One-time migration: backfill firstSeen for all existing geo-cache entries on S3.
Sets firstSeen = today (UTC) for any entry missing it, then uploads back to S3.
Run once after deploying the firstSeen feature.
"""
import json, sys, boto3
from botocore.exceptions import BotoCoreError, ClientError
from datetime import datetime, timezone

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/geo-cache.json"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

s3 = boto3.client('s3', region_name='us-west-2')

# Download and parse
try:
    obj = s3.get_object(Bucket=BUCKET, Key=KEY)
    raw = obj['Body'].read()
except (BotoCoreError, ClientError) as e:
    print(f"ERROR: Failed to download geo-cache from S3: {e}", file=sys.stderr)
    sys.exit(1)

try:
    cache = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"ERROR: Failed to parse geo-cache JSON: {e}", file=sys.stderr)
    sys.exit(1)

if 'entries' not in cache or not isinstance(cache['entries'], dict):
    print("ERROR: geo-cache JSON is missing 'entries' object", file=sys.stderr)
    sys.exit(1)

# Backfill
count = 0
for k, v in cache['entries'].items():
    if 'firstSeen' not in v:
        v['firstSeen'] = TODAY
        count += 1

print(f"Backfilled {count} entries with firstSeen={TODAY}")

# Upload
try:
    s3.put_object(
        Bucket=BUCKET,
        Key=KEY,
        Body=json.dumps(cache, indent=2).encode(),
        ContentType='application/json'
    )
except (BotoCoreError, ClientError) as e:
    print(f"ERROR: Failed to upload geo-cache to S3: {e}", file=sys.stderr)
    sys.exit(1)

print("Uploaded to S3")
