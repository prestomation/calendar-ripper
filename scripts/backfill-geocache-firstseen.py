#!/usr/bin/env python3
"""
One-time migration: backfill firstSeen for all existing geo-cache entries on S3.
Sets firstSeen = today (UTC) for any entry missing it, then uploads back to S3.
Run once after deploying the firstSeen feature.
"""
import json, sys, boto3
from datetime import datetime, timezone

BUCKET = "calendar-ripper-outofband-220483515252"
KEY = "latest/geo-cache.json"
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

s3 = boto3.client('s3', region_name='us-west-2')

# Download
obj = s3.get_object(Bucket=BUCKET, Key=KEY)
cache = json.loads(obj['Body'].read())

# Backfill
count = 0
for k, v in cache['entries'].items():
    if 'firstSeen' not in v:
        v['firstSeen'] = TODAY
        count += 1

print(f"Backfilled {count} entries with firstSeen={TODAY}")

# Upload
s3.put_object(
    Bucket=BUCKET,
    Key=KEY,
    Body=json.dumps(cache, indent=2).encode(),
    ContentType='application/json'
)
print("Uploaded to S3")
