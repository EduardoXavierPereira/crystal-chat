# Crystal Chat Self-Hosted Update System

Your Crystal Chat app now uses a **self-hosted update server** instead of relying on GitHub's public releases API. This means you have complete control over when and how updates are distributed.

## How It Works

```
┌─────────────────┐
│  Crystal Chat   │
│  (User's PC)    │
└────────┬────────┘
         │
         │ "Check for updates"
         │ GET /api/updates
         │
         ▼
┌─────────────────────────────────────┐
│   Your Update Server                │
│   (Your VPS / Cloud)                │
│                                     │
│  Reads: updates.json               │
│  ├─ Version: 0.10.1               │
│  ├─ URL: https://...exe           │
│  └─ Release notes                 │
└────────┬────────────────────────────┘
         │
         │ "Yes, v0.10.1 available"
         │ + download URL
         │
         ▼
┌─────────────────────────────────┐
│  User sees update notification  │
│  [Update Now] [Later]           │
└─────────────────────────────────┘
```

## Files You Now Have

### App-Side Changes
- **`src/main/custom-updater.js`** - Custom update checker (replaces electron-updater's GitHub integration)
- **`src/main/updater.js`** - Updated to use custom updater
- **`main.js`** - Now accepts `UPDATE_SERVER_URL` environment variable

### Server-Side (New Directory: `update-server/`)
- **`server.js`** - Node.js HTTP server that serves update info
- **`updates.json`** - Configuration file (edit this to publish new releases)
- **`package.json`** - Dependencies for the server
- **`publish-release.sh`** - Helper script to publish releases
- **`README.md`** - Quick reference
- **`DEPLOYMENT.md`** - Complete deployment guide

## Quick Start

### Local Testing

1. **Start the update server:**
   ```bash
   cd update-server
   npm install
   npm start
   ```

   Server runs on `http://localhost:3000`

2. **Test the endpoint:**
   ```bash
   curl http://localhost:3000/api/updates
   ```

   You should see the current release info from `updates.json`

3. **Run Crystal Chat with custom server:**
   ```bash
   export UPDATE_SERVER_URL="http://localhost:3000/api/updates"
   npm start
   ```

   The app will check your local server for updates.

### Publishing Your First Release

1. **Build a release:**
   ```bash
   npm run dist:win
   # Produces: dist/Crystal-Chat-0.10.0.exe
   ```

2. **Upload the .exe to your server** (examples in DEPLOYMENT.md):
   - Option A: Same VPS where update server runs
   - Option B: AWS S3 / CDN
   - Option C: Any public web server

3. **Update `update-server/updates.json`:**
   ```json
   {
     "latest": {
       "version": "0.10.0",
       "releaseName": "v0.10.0",
       "releaseNotes": "Initial private release",
       "url": "https://your-domain.com/downloads/Crystal-Chat-0.10.0.exe"
     }
   }
   ```

4. **Publish using the helper script:**
   ```bash
   ./update-server/publish-release.sh 0.10.0 "https://your-domain.com/downloads/Crystal-Chat-0.10.0.exe"
   ```

## Production Deployment

See **`update-server/DEPLOYMENT.md`** for detailed instructions on:

- **VPS Setup** (DigitalOcean, Linode, Vultr) - Recommended
- **Docker** deployment
- **Heroku** (for simplicity)
- **AWS Lambda** (serverless)
- **HTTPS/SSL** setup
- **Monitoring** and uptime checks
- **Release management workflow**

## Environment Variables

When building Crystal Chat releases, set:

```bash
export UPDATE_SERVER_URL="https://updates.your-domain.com/api/updates"
npm run dist:win
npm run dist:mac
npm run dist:linux
```

This URL is baked into each built app and used to check for updates.

## Key Differences from GitHub Updates

### Before (GitHub Public)
- ❌ Repo must be public
- ❌ Can't control who downloads
- ✅ Automatic release handling
- ✅ Free

### Now (Self-Hosted)
- ✅ Repo can be private
- ✅ Full control over distribution
- ✅ No GitHub API calls needed
- ✅ Can add authentication if needed
- ⚠️ You manage the server

## Security Notes

1. **Use HTTPS** - Always in production (Let's Encrypt is free)
2. **Rate limiting** - Consider adding rate limits if you expect high traffic
3. **Version validation** - App validates new version > current version
4. **Signature field** - Reserved for future cryptographic verification

## Managing Updates

### Publish a new release:
1. Build: `npm run dist:win`
2. Upload .exe to server
3. Update `updates.json` with new version and URL
4. Server automatically serves new version on next client check

### Rollback a bad release:
```json
{
  "latest": {
    "version": "0.10.0",
    "url": "https://your-domain.com/downloads/Crystal-Chat-0.10.0.exe"
  }
}
```

Users will revert on next update check.

### No update available:
```json
{
  "latest": null
}
```

Or omit the `latest` field entirely.

## Troubleshooting

### Clients not seeing updates

1. **Server is running:**
   ```bash
   curl https://updates.your-domain.com/api/updates
   ```

2. **UPDATE_SERVER_URL is set correctly** when building app

3. **Version comparison:**
   - Client 0.10.0 will only update to 0.10.1+
   - Won't downgrade (0.10.0 won't update to 0.9.0)

4. **Check app logs:**
   - DevTools → Console
   - Look for errors like "update-available" or network errors

### Server deployment issues

See **`update-server/DEPLOYMENT.md`** for common deployment scenarios.

## Workflow Example

```bash
# 1. Develop and test new features
git commit -m "Add dark mode"

# 2. Update version in package.json
# 3. Build release
npm run dist:win

# 4. Upload to server
scp dist/Crystal-Chat-0.11.0.exe prod-server:/var/www/releases/

# 5. Publish
./update-server/publish-release.sh 0.11.0 \
  "https://updates.your-domain.com/releases/Crystal-Chat-0.11.0.exe" \
  release-notes.txt

# 6. Users see update notification on next app check
```

## Questions?

- **How to deploy?** → See `update-server/DEPLOYMENT.md`
- **How to customize?** → Edit `src/main/custom-updater.js`
- **How to add security?** → Check DEPLOYMENT.md security section
- **How to monitor?** → See monitoring section in DEPLOYMENT.md

## Next Steps

1. **Choose a deployment option** from DEPLOYMENT.md (VPS recommended)
2. **Set up your update server**
3. **Configure UPDATE_SERVER_URL** environment variable
4. **Build and test** with a local server first
5. **Deploy** to production
6. **Publish your first release** when ready

---

**You are now in control of your app distribution. No more GitHub public repos required!** 🚀
