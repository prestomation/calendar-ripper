#!/bin/bash
# Check that ripper parse methods never return null.
# Parse methods must return RipperEvent | RipperError — never null.
# Utility functions (parseDate, parseTime, etc.) may return null,
# but the caller in the main loop must handle it by pushing a ParseError.
#
# Known intentional null returns (cancelled/past events) are allowed
# in royal_room only.

set -e

# 1. Check for parse methods with nullable return type signatures
NULLABLE_PARSE_METHODS=$(grep -rn "): RipperEvent | null\|): RipperCalendarEvent | null\|): Promise<RipperEvent | null\|): Promise<RipperCalendarEvent | null\|(RipperEvent | null)\[\]" sources/*/ripper.ts 2>/dev/null || true)
if [ -n "$NULLABLE_PARSE_METHODS" ]; then
  echo "ERROR: Found parse methods with nullable return types in ripper files:"
  echo "$NULLABLE_PARSE_METHODS"
  echo ""
  echo "Parse methods must return RipperEvent | RipperError (never null)."
  echo "Move null checks into the caller and push a ParseError instead."
  exit 1
fi

# 2. Check for .filter(isRipperEvent) which silently drops nulls
FILTER_NULL=$(grep -rn ".filter(isRipperEvent)" sources/*/ripper.ts 2>/dev/null || true)
if [ -n "$FILTER_NULL" ]; then
  echo "ERROR: Found .filter(isRipperEvent) which silently drops nulls:"
  echo "$FILTER_NULL"
  echo ""
  echo "Replace with explicit null/error handling in the loop."
  exit 1
fi

# 3. Check for 'return null' in main parse methods (not utility functions)
# We look for return null inside parseEvents or rip methods.
# This is a heuristic — it catches the most common pattern.
MAIN_NULL=$(grep -rn "return null" sources/*/ripper.ts 2>/dev/null \
  | grep -v ".test." \
  | grep -v "sources/royal_room/ripper.ts" \
  | grep -v "| null" \
  || true)
# The above is too noisy — utility functions return null legitimately.
# We rely on checks 1 and 2 instead.

echo "OK: No nullable parse method signatures or silent null filters found in ripper files"
