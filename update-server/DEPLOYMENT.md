# Self-Hosted Update Server Deployment Guide

This guide explains how to deploy and manage the Crystal Chat update server.

## Overview

The update server is a simple Node.js HTTP server that provides version information and download URLs to Crystal Chat clients. Clients check this endpoint every ~900ms on startup to see if updates are available.

## Quick Start (Local Testing)

```bash
cd update-server
npm install
npm start
```

Server will run on `http://localhost:3000`

Update endpoint: `http://localhost:3000/api/updates`

## Configuration

### Update Information (updates.json)

The `updates.json` file contains the current release information:

```json
{
  "latest": {
    "version": "0.11.0",
    "releaseName": "v0.11.0",
    "releaseNotes": "Fixed bug X, added feature Y",
    "url": "https://your-domain.com/downloads/Crystal-Chat-0.11.0.exe",
    "signature": "optional-signature"
  }
}
```

**Fields:**
- `version`: Semantic version (e.g., "0.11.0"). Must be newer than client's current version for update to trigger.
- `releaseName`: Human-readable name (e.g., "v0.11.0")
- `releaseNotes`: Changelog (markdown supported in UI)
- `url`: Full URL to download the .exe installer. Can be on any server/CDN.
- `signature`: Optional cryptographic signature for installer verification (reserved for future use)

### Environment Variables

- `PORT`: Server port (default: 3000)
- `UPDATE_CONFIG_PATH`: Path to updates.json (default: `./updates.json`)

Example:
```bash
PORT=8080 UPDATE_CONFIG_PATH=/var/updates.json npm start
```

## Deployment Options

### Option 1: Simple VPS (Recommended for Small Users)

**Recommended Setup:**
- VPS provider: DigitalOcean, Linode, Vultr (~$5-10/month)
- Node.js + PM2 for process management
- Nginx as reverse proxy (optional, for HTTPS)
- Store release files on same VPS or CDN

**Steps:**

1. **Set up server:**
   ```bash
   # SSH into VPS
   ssh root@your-vps-ip

   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2 globally
   sudo npm install -g pm2
   ```

2. **Deploy update server:**
   ```bash
   # Clone or upload your repo
   git clone <your-repo> crystal-chat-updates
   cd crystal-chat-updates/update-server
   npm install

   # Start with PM2
   pm2 start server.js --name "crystal-updates"
   pm2 startup
   pm2 save

   # Verify running
   curl http://localhost:3000/health
   ```

3. **Set up reverse proxy (Nginx for HTTPS):**
   ```bash
   sudo apt-get install -y nginx

   # Create config file
   sudo cat > /etc/nginx/sites-available/updates << 'EOF'
   server {
     listen 80;
     server_name updates.your-domain.com;

     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   EOF

   # Enable site
   sudo ln -s /etc/nginx/sites-available/updates /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx

   # Install SSL with Let's Encrypt
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d updates.your-domain.com
   ```

4. **Configure Crystal Chat:**
   ```bash
   # When building/running Crystal Chat
   export UPDATE_SERVER_URL="https://updates.your-domain.com/api/updates"
   npm run dist
   ```

### Option 2: Heroku (Free/Paid, Easy)

**Pros:** No server management, free tier available
**Cons:** Cold starts, slower

1. **Deploy to Heroku:**
   ```bash
   cd update-server
   heroku create crystal-chat-updates
   git push heroku main
   ```

2. **Configure:**
   ```bash
   heroku config:set UPDATE_SERVER_URL="https://crystal-chat-updates.herokuapp.com/api/updates"
   ```

### Option 3: AWS Lambda + API Gateway (Serverless)

**Pros:** Scalable, pay-per-request
**Cons:** Requires AWS setup

1. **Package for Lambda:**
   ```bash
   # Use frameworks like Serverless or AWS SAM
   npm install -g serverless
   serverless deploy
   ```

### Option 4: Docker Containerization

**For any cloud platform (AWS, GCP, Azure, DigitalOcean):**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Deploy:
```bash
docker build -t crystal-chat-updates .
docker run -e UPDATE_SERVER_URL=... -p 3000:3000 crystal-chat-updates
```

## Managing Updates

### Publishing a New Release

1. **Build the new version:**
   ```bash
   npm run dist:win
   # Produces: dist/Crystal-Chat-0.11.0.exe
   ```

2. **Upload installer to your server:**
   - Option A: Same VPS
   ```bash
   scp dist/Crystal-Chat-0.11.0.exe root@your-vps:/var/www/downloads/
   ```
   - Option B: S3 / CDN
   ```bash
   aws s3 cp dist/Crystal-Chat-0.11.0.exe s3://your-bucket/releases/
   ```

3. **Update `updates.json`:**
   ```json
   {
     "latest": {
       "version": "0.11.0",
       "releaseName": "v0.11.0",
       "releaseNotes": "- Fixed issue X\n- Added feature Y",
       "url": "https://your-domain.com/downloads/Crystal-Chat-0.11.0.exe"
     }
   }
   ```

4. **Reload server (if using PM2):**
   ```bash
   pm2 restart crystal-updates
   ```

   Or if running directly:
   - Terminate server (Ctrl+C)
   - Run `npm start` again

5. **Test locally:**
   ```bash
   # On your dev machine
   export UPDATE_SERVER_URL="https://your-domain.com/api/updates"
   npm start
   # Check for update notification in app
   ```

## Security Considerations

1. **HTTPS Only**: Always use HTTPS in production (Let's Encrypt is free)
2. **Version Validation**: The app validates that server version > current version
3. **Download Verification**: Consider adding checksum verification (see `signature` field in updates.json)
4. **Rate Limiting**: Add rate limiting to prevent abuse
   ```javascript
   // In server.js, use express-rate-limit
   const rateLimit = require('express-rate-limit');
   ```

5. **Access Control**: Optionally require authentication for admin endpoints

## Monitoring

### Health Check

```bash
curl https://your-domain.com/health
# Returns: {"status": "ok"}
```

### Logs (if using PM2)

```bash
pm2 logs crystal-updates
```

### Uptime Monitoring

Use UptimeRobot or similar to monitor:
```
https://your-domain.com/health
```

## Rollback (Downgrade)

If a release has critical bugs:

1. **Revert updates.json to previous version:**
   ```json
   {
     "latest": {
       "version": "0.10.0",
       "url": "https://your-domain.com/downloads/Crystal-Chat-0.10.0.exe"
     }
   }
   ```

2. **Restart server**
3. **Clients will revert to 0.10.0 on next check**

## Troubleshooting

### Clients Not Seeing Updates

1. **Verify server is running:**
   ```bash
   curl http://localhost:3000/api/updates
   ```

2. **Check UPDATE_SERVER_URL env var is set:**
   ```bash
   echo $UPDATE_SERVER_URL
   ```

3. **Check app logs (DevTools):**
   - Open app → DevTools → Console
   - Look for `checkForUpdates` errors

4. **Verify version comparison:**
   - Current version in app must be < server version
   - Example: Client 0.10.0 will see update to 0.11.0, but not to 0.10.5

### Server Errors

```bash
# Check logs
pm2 logs crystal-updates

# Verify config file exists
cat updates.json

# Test endpoint
curl -v http://localhost:3000/api/updates
```

## Performance Tips

1. **Cache responses**: Add HTTP caching headers
   ```javascript
   res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
   ```

2. **Use CDN for downloads**: Don't serve .exe files from update server
   - Use S3, Cloudflare, Bunny CDN, etc.

3. **Monitor server load**: With many clients checking ~every 15 min, ~1000 users = ~60 req/min

## Next Steps

1. **Set up your preferred deployment** (VPS recommended for simplicity)
2. **Build your first release** and upload to server
3. **Update updates.json** with release info
4. **Set UPDATE_SERVER_URL environment variable** when building releases
5. **Test** by installing older version and checking for update prompt

Questions? Check the main Crystal Chat README or contact support.
