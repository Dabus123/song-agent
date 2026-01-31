# SongCast XMTP Agent

XMTP chat agent that automatically tokenizes Spotify tracks into music coins on SongCast.

## Features

- 🎵 Listens for Spotify track URLs in XMTP chat
- 🪙 Automatically creates music coins from Spotify tracks
- 💰 Supports x402 payment protocol (optional)
- 🚀 Works with SongCast API hosted on Vercel

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Environment Variables

Create a `.env` file:

```bash
# Required
XMTP_WALLET_KEY=0x... # Your agent wallet private key (must start with 0x)
XMTP_DB_ENCRYPTION_KEY=... # 64 hex characters (32 bytes)
XMTP_ENV=production # Options: local, dev, production

# Required - Your SongCast API URL
NEXT_PUBLIC_BASE_URL=https://songcast.xyz

# Optional - For x402 payments
X402_COIN_CREATION_PRICE=0.01
X402_PAYMENT_RECIPIENT=0x...
NETWORK=base

# Optional - Escrow address for Spotify payouts
NEXT_PUBLIC_ESCROW_ADDRESS=0x...

# Optional - Mention Detection (for group chat filtering)
# In groups, agent only responds when mentioned. In DMs, always responds.
# Defaults: song.base.eth, songcast, song
MENTION_HANDLES=song.base.eth,songcast,song
```

### 3. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `XMTP_DB_ENCRYPTION_KEY`.

### 4. Start the Agent

```bash
pnpm start
```

## Deployment

### Railway

1. Create a new Railway project
2. Deploy from this GitHub repository
3. Add environment variables in Railway dashboard:
   - `XMTP_WALLET_KEY` (required)
   - `XMTP_DB_ENCRYPTION_KEY` (required)
   - `XMTP_ENV=production` (required)
   - `NEXT_PUBLIC_BASE_URL` (required - your Vercel URL)
   - `RAILWAY_VOLUME_MOUNT_PATH=/data` (optional but recommended)
4. Add a volume for database storage:
   - Click "New" → "Volume"
   - Set mount path: `/data`
   - This ensures database persists across deployments
5. The agent will automatically create the database directory if it doesn't exist

### Other Platforms

Works on any platform that supports:
- Node.js 18+
- Persistent storage (for XMTP database)
- Environment variables

Examples: Fly.io, Render, Heroku, DigitalOcean

## How It Works

1. User sends a Spotify track URL to the agent via XMTP
2. Agent extracts the track ID and fetches metadata from SongCast API
3. Agent creates IPFS metadata via SongCast API
4. Agent creates coin on-chain via SongCast API (with optional x402 payment)
5. Agent sends coin address back to user

## Architecture

```
User (XMTP Chat)
    ↓
XMTP Agent (this repo)
    ↓
SongCast API (Vercel)
    ├─→ /api/spotify/track
    ├─→ /api/pinata/json
    └─→ /api/create-coin-chat
```

## Troubleshooting

### "Already registered 10/10 installations"

XMTP allows up to 10 installations per inbox. If you see this error (e.g. on Railway after many deploys or restarts without a persistent DB), you must revoke some installations:

1. Go to **[xmtp.chat/inbox-tools](https://xmtp.chat/inbox-tools)**
2. Connect with the same wallet as `XMTP_WALLET_KEY`, or paste your Inbox ID (shown in the error message)
3. Revoke enough installations to free a slot (e.g. revoke 9 to keep 1)
4. Redeploy or restart the agent

To avoid hitting the limit again, use a **persistent volume** on Railway (`RAILWAY_VOLUME_MOUNT_PATH=/data` and a volume mounted at `/data`) so the same database is reused and no new installation is created on each deploy.

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)
- XMTP wallet with private key
- SongCast API deployed and accessible

## License

MIT

