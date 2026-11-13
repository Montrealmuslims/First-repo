#!/usr/bin/env bash
# Runs the Android child app's network client (JVM unit test) against a live
# API with a fresh demo family. Needs a running API (npm start) whose database
# the seed script can write to (same DATABASE_URL), and the Android SDK.
#   DATABASE_URL=... GUARDIAN_API_URL=http://localhost:3000 scripts/child-app-integration.sh
set -euo pipefail
cd "$(dirname "$0")/.."
API="${GUARDIAN_API_URL:-http://localhost:3000}"
SEED=$(node scripts/seed-dev.js)
field() { node -e "console.log(JSON.parse(process.argv[1])[process.argv[2]])" "$SEED" "$1"; }
PARENT_TOKEN=$(field parentToken)
CHILD_ID=$(field childId)
CODE=$(curl -fsS -X POST "$API/v1/children/$CHILD_ID/pairing-codes" -H "authorization: Bearer $PARENT_TOKEN" \
  | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).code))")
cd ../child-app
GUARDIAN_API_URL="$API" GUARDIAN_PAIRING_CODE="$CODE" GUARDIAN_PARENT_TOKEN="$PARENT_TOKEN" GUARDIAN_CHILD_ID="$CHILD_ID" \
  ./gradlew --rerun-tasks testDebugUnitTest --tests '*ApiIntegrationTest*'
