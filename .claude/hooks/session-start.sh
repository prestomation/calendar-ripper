#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install npm dependencies
cd "$CLAUDE_PROJECT_DIR"
npm install

echo ""
echo "NOTE: gh CLI is not available in this environment."
echo "Code can only be pushed to the assigned branch."
echo "The user must create the PR manually on GitHub."
