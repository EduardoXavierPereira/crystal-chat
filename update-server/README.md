# Crystal Chat Update Server

A lightweight, self-hosted update server for managing Crystal Chat releases.

## Features

- ✅ Simple HTTP server (no database required)
- ✅ JSON-based configuration
- ✅ Semantic version comparison
- ✅ Easy deployment (Node.js, Docker, or cloud platforms)
- ✅ CORS enabled for cross-origin requests
- ✅ Health check endpoint

## Quick Start

### Local Development

```bash
npm install
npm start
```

Server will be available at `http://localhost:3000`

### API Endpoint

- **GET** `/api/updates` - Check for updates
- **GET** `/health` - Health check

## Configuration

Edit `updates.json` to specify the current release:

```json
{
  "latest": {
    "version": "0.10.1",
    "releaseName": "v0.10.1",
    "releaseNotes": "Bug fixes and improvements",
    "url": "https://your-domain.com/releases/Crystal-Chat-0.10.1.exe"
  }
}
```

## Integration with Crystal Chat

When building Crystal Chat, set the `UPDATE_SERVER_URL` environment variable:

```bash
export UPDATE_SERVER_URL="https://updates.example.com/api/updates"
npm run dist:win
```

The built app will check this URL for updates.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions including:

- VPS setup (DigitalOcean, Linode, etc.)
- Docker deployment
- Heroku deployment
- AWS Lambda / serverless options
- SSL/HTTPS configuration
- Production monitoring

## API Response Format

When a client checks for updates, the server returns:

```json
{
  "version": "0.10.1",
  "releaseName": "v0.10.1",
  "releaseNotes": "...",
  "url": "https://...",
  "signature": "optional"
}
```

Or `null` if no update is available.

## Client Behavior

Crystal Chat clients will:

1. Check for updates on startup (~900ms after launch)
2. Compare server version with installed version (semantic versioning)
3. If server version > client version, show update notification
4. User can choose to download and install update
5. On next launch, updated version is running

## Environment Variables

- `PORT` - Server port (default: 3000)
- `UPDATE_CONFIG_PATH` - Path to updates.json (default: ./updates.json)

Example:
```bash
PORT=8080 UPDATE_CONFIG_PATH=/etc/crystal-updates.json npm start
```

## Development

### Testing Locally

```bash
npm start
# In another terminal:
curl http://localhost:3000/api/updates
```

### Running with PM2 (Production)

```bash
npm install -g pm2
pm2 start server.js --name "crystal-updates"
pm2 save
pm2 startup
```

## Updating Releases

To publish a new version:

1. Build the new version:
   ```bash
   npm run dist:win
   ```

2. Upload the .exe to your server/CDN

3. Update `updates.json`:
   ```json
   {
     "latest": {
       "version": "0.10.2",
       "url": "https://your-domain.com/releases/Crystal-Chat-0.10.2.exe"
     }
   }
   ```

4. Restart the server or manually reload (server reloads config on each request)

Clients will see the update notification on their next check.

## Troubleshooting

### Server won't start

```bash
# Check if port is already in use
lsof -i :3000

# Run on different port
PORT=3001 npm start
```

### Updates not showing in client

1. Verify server is running: `curl http://localhost:3000/health`
2. Check client's UPDATE_SERVER_URL matches: `curl http://your-url/api/updates`
3. Ensure server version > client version
4. Check app DevTools console for errors

### CORS errors in client

The server has CORS enabled by default. If still seeing errors:

```javascript
// In server.js, headers are already set:
res.setHeader('Access-Control-Allow-Origin', '*');
```

## License

Unlicensed (proprietary)

## Support

For issues with Crystal Chat, see the main repository README.

For update server deployment help, see [DEPLOYMENT.md](./DEPLOYMENT.md)
