#!/usr/bin/env python3
"""
Purge stale unresolvable geo-cache entries from S3.

Removes entries where:
1. unresolvable: true AND key contains dirty patterns (backslash-escaped commas,
   HTML entities, HTML tags, Google Maps URLs)
2. Key appears truncated mid-word (ends without completing an expected suffix)
"""

import json
import subprocess
import sys
import re
import tempfile
import os

S3_URI = "s3://calendar-ripper-outofband-220483515252/latest/geo-cache.json"

DIRTY_PATTERNS = [
    r'\\,',           # backslash-escaped comma
    r'\\;',           # backslash-escaped semicolon
    r'<br',           # HTML br tag (catches <br>, <br/>, <BR>)
    r'&amp;',         # HTML entity &amp;
    r'&#',            # HTML numeric entity
    r'https://www\.google\.com/maps',  # Google Maps URL
]

def is_dirty_key(key: str) -> bool:
    for pat in DIRTY_PATTERNS:
        if re.search(pat, key, re.IGNORECASE):
            return True
    return False

def is_truncated_key(key: str) -> bool:
    """
    Detect keys that appear to be truncated mid-word or mid-address.
    A key is considered truncated if it ends with a single character or partial word
    after the last comma/space separator, suggesting the string was cut off.
    
    Examples of truncated keys:
    - "wallingford united methodist church, 2115 n 42nd st, seattle, w"
    - "some venue, seattle, wa 9"
    
    Heuristic: the last segment after the last comma is 1-3 chars but not a known
    abbreviation (like "wa", "or", "ca" state codes), or the string ends mid-zipcode.
    """
    key = key.strip()
    if not key:
        return False
    
    # Split on last comma
    parts = key.rsplit(',', 1)
    if len(parts) < 2:
        # No comma at all — single token, hard to judge
        return False
    
    last_segment = parts[-1].strip()
    
    # If the last segment is very short (1-2 chars), it's likely truncated
    # unless it's a known abbreviation
    known_endings = {
        'wa', 'or', 'ca', 'id', 'ak', 'mt', 'nv', 'az', 'ut', 'co', 'nm',
        'us', 'usa',
    }
    
    if len(last_segment) <= 2 and last_segment.lower() not in known_endings:
        return True
    
    # Check for truncated zip codes (e.g., "981", "9812", "98" — partial 5-digit zip)
    # A full US zip is 5 digits, or 5+4 with hyphen
    zip_partial = re.match(r'^\d{1,4}$', last_segment)
    if zip_partial:
        return True
    
    # Check if string ends with a single letter (not a state abbreviation)
    # e.g., ", w" at the end
    if len(last_segment) == 1 and last_segment.isalpha():
        return True
    
    return False

def main():
    # Download cache from S3
    print(f"Downloading geo-cache from {S3_URI}...")
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
        tmp_path = f.name
    
    try:
        result = subprocess.run(
            ['aws', 's3', 'cp', S3_URI, tmp_path],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"ERROR downloading from S3: {result.stderr}")
            sys.exit(1)
        
        with open(tmp_path) as f:
            cache = json.load(f)
        
        entries = cache.get('entries', {})
        total_before = len(entries)
        print(f"Total entries before purge: {total_before}")
        
        # Find entries to remove
        to_remove = []
        for key, entry in entries.items():
            if not entry.get('unresolvable', False):
                # Only purge unresolvable entries — keep any that somehow resolved
                continue
            
            if is_dirty_key(key):
                to_remove.append((key, 'dirty_key'))
            elif is_truncated_key(key):
                to_remove.append((key, 'truncated_key'))
        
        # Print what we're removing
        print(f"\nEntries to remove ({len(to_remove)}):")
        dirty_count = sum(1 for _, reason in to_remove if reason == 'dirty_key')
        truncated_count = sum(1 for _, reason in to_remove if reason == 'truncated_key')
        print(f"  - Dirty keys (escaped chars, HTML, URLs): {dirty_count}")
        print(f"  - Truncated keys: {truncated_count}")
        
        if len(to_remove) <= 30:
            for key, reason in to_remove:
                print(f"  [{reason}] {repr(key)}")
        else:
            # Show first 20 and last 10
            for key, reason in to_remove[:20]:
                print(f"  [{reason}] {repr(key)}")
            print(f"  ... ({len(to_remove) - 30} more) ...")
            for key, reason in to_remove[-10:]:
                print(f"  [{reason}] {repr(key)}")
        
        # Remove them
        for key, _ in to_remove:
            del entries[key]
        
        total_after = len(entries)
        removed = total_before - total_after
        print(f"\nRemoved {removed} entries")
        print(f"Entries after purge: {total_after}")
        
        # Write back to temp file
        with open(tmp_path, 'w') as f:
            json.dump(cache, f, indent=2)
        
        # Upload back to S3
        print(f"\nUploading cleaned cache to {S3_URI}...")
        result = subprocess.run(
            ['aws', 's3', 'cp', tmp_path, S3_URI],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"ERROR uploading to S3: {result.stderr}")
            sys.exit(1)
        
        print(f"Done! Removed {removed} stale unresolvable entries from geo-cache.")
        
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

if __name__ == '__main__':
    main()
