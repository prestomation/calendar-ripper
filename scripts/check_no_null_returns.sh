#!/bin/bash
# Check that no ripper parse methods declare a nullable return type.
# Utility functions may return null internally, but public/private parse methods
# that produce RipperEvent or RipperCalendarEvent must never declare | null.
NULLABLE_PARSE_METHODS=$(grep -rn "): RipperEvent | null\|): RipperCalendarEvent | null\|): Promise<RipperEvent | null\|): Promise<RipperCalendarEvent | null" sources/*/ripper.ts 2>/dev/null)
if [ -n "$NULLABLE_PARSE_METHODS" ]; then
  echo "ERROR: Found parse methods that return null in ripper files:"
  echo "$NULLABLE_PARSE_METHODS"
  echo ""
  echo "Parse methods must return RipperEvent | RipperError (never null)."
  echo "Move null checks into the caller and push a ParseError instead."
  exit 1
fi
echo "OK: No nullable parse method signatures found in ripper files"
