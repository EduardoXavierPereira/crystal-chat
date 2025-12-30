#!/bin/bash

# Crystal Chat Release Publisher
# This script helps publish a new release to the update server
#
# Usage: ./publish-release.sh <version> <download-url> [release-notes-file]
#
# Example:
#   ./publish-release.sh 0.10.1 "https://s3.example.com/releases/Crystal-Chat-0.10.1.exe"
#   ./publish-release.sh 0.10.1 "https://s3.example.com/releases/Crystal-Chat-0.10.1.exe" release-notes.txt

set -e

VERSION=$1
URL=$2
NOTES_FILE=$3
CONFIG_FILE="$(dirname "$0")/updates.json"

if [ -z "$VERSION" ] || [ -z "$URL" ]; then
  echo "Usage: $0 <version> <download-url> [release-notes-file]"
  echo ""
  echo "Example:"
  echo "  $0 0.10.1 'https://example.com/Crystal-Chat-0.10.1.exe'"
  echo "  $0 0.10.1 'https://example.com/Crystal-Chat-0.10.1.exe' release-notes.txt"
  exit 1
fi

# Read release notes if provided
RELEASE_NOTES=""
if [ -n "$NOTES_FILE" ] && [ -f "$NOTES_FILE" ]; then
  RELEASE_NOTES=$(cat "$NOTES_FILE" | jq -Rs .)
  RELEASE_NOTES="${RELEASE_NOTES:1:${#RELEASE_NOTES}-2}"  # Remove quotes
fi

echo "📦 Publishing Crystal Chat v$VERSION"
echo "🔗 URL: $URL"
if [ -n "$RELEASE_NOTES" ]; then
  echo "📝 Release notes: $(echo "$RELEASE_NOTES" | head -c 50)..."
fi

# Create/update updates.json
jq --arg version "$VERSION" \
   --arg url "$URL" \
   --arg releaseName "v$VERSION" \
   --arg notes "$RELEASE_NOTES" \
   '.latest = {
     version: $version,
     releaseName: $releaseName,
     releaseNotes: $notes,
     url: $url,
     signature: ""
   }' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"

mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"

echo ""
echo "✅ Release published to $CONFIG_FILE"
echo ""
echo "Updated configuration:"
jq '.latest' "$CONFIG_FILE"
echo ""
echo "Next steps:"
echo "1. Restart the update server: pm2 restart crystal-updates"
echo "2. Test with: curl http://localhost:3000/api/updates"
echo "3. Clients will see the update on next check"
