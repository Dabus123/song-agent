/**
 * XMTP Agent Service for SongCast
 * 
 * This agent listens for Spotify URLs in XMTP chat messages
 * and automatically creates music coins using x402 payments
 */

import { Address } from 'viem';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { isMentioned, removeMention } from './utils/mentions.js';
import {
  CopySuggestionCodec,
  ContentTypeCopySuggestion,
} from './content-types/copy-suggestion.js';

// Parse Spotify track ID from various formats
function parseSpotifyTrackId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // spotify:track:ID
  if (trimmed.startsWith('spotify:track:')) {
    return trimmed.split(':').pop() ?? null;
  }

  // https://open.spotify.com/track/ID
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('spotify.com')) {
      const parts = url.pathname.split('/');
      const trackIndex = parts.indexOf('track');
      if (trackIndex !== -1 && parts[trackIndex + 1]) {
        return parts[trackIndex + 1];
      }
    }
  } catch {
    // not a valid URL, continue
  }

  // Plain ID (22 characters)
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// Extract Spotify URLs from message text
function extractSpotifyUrls(message: string): string[] {
  const urls: string[] = [];
  const extractedTrackIds = new Set<string>();
  
  // Match Spotify URLs (stop at query parameters or end of track ID)
  // Track IDs are exactly 22 characters, so we match exactly 22 chars after /track/
  const urlRegex = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/track\/([a-zA-Z0-9]{22})(?:\?|$|\s|"|'|\))/g;
  let match;
  while ((match = urlRegex.exec(message)) !== null) {
    const fullUrl = match[0].replace(/[?)\s"'$]+$/, ''); // Remove trailing query params, quotes, etc.
    const trackId = match[1];
    urls.push(fullUrl);
    extractedTrackIds.add(trackId);
  }
  
  // Match spotify:track: URIs
  const uriRegex = /spotify:track:([a-zA-Z0-9]{22})(?:\s|$|"|'|\))/g;
  while ((match = uriRegex.exec(message)) !== null) {
    const fullUri = match[0].replace(/[\s"'$)]+$/, '');
    const trackId = match[1];
    urls.push(fullUri);
    extractedTrackIds.add(trackId);
  }
  
  // Match plain track IDs (22 chars) that are NOT part of a URL
  // We need to check that they're not already extracted from a URL
  const idRegex = /\b([a-zA-Z0-9]{22})\b/g;
  while ((match = idRegex.exec(message)) !== null) {
    const trackId = match[1];
    // Only add if it's not already extracted from a URL
    // Also check it's not part of a URL pattern (not preceded by /track/ or :track:)
    const beforeMatch = message.substring(Math.max(0, match.index - 20), match.index);
    const isPartOfUrl = /(?:spotify\.com\/track\/|spotify:track:)$/.test(beforeMatch);
    
    if (!isPartOfUrl && !extractedTrackIds.has(trackId)) {
      urls.push(trackId);
      extractedTrackIds.add(trackId);
    }
  }
  
  return [...new Set(urls)]; // Deduplicate
}

// Create payment signature for x402
async function createPaymentSignature(
  paymentDetails: any,
  walletPrivateKey: string
): Promise<string> {
  // For now, we'll implement a simple payment flow
  // In production, you'd use @x402/client or @x402/evm/client to create proper signatures
  // This is a placeholder - you'll need to implement the actual x402 payment signature
  
  // TODO: Implement proper x402 payment signature using @x402/client or @x402/evm/client
  // For now, return a placeholder that indicates payment intent
  return JSON.stringify({
    amount: paymentDetails.amount,
    recipient: paymentDetails.recipient,
    reference: paymentDetails.reference,
    network: paymentDetails.network || 'eip155:8453',
  });
}

// Create coin from Spotify track
async function createCoinFromSpotifyTrack(
  trackId: string,
  walletPrivateKey: string,
  baseUrl: string
): Promise<{ coinAddress: Address; transactionHash: string; trackName: string; artistName: string }> {
  // Step 1: Fetch track data from Spotify
  const spotifyResponse = await axios.get(`${baseUrl}/api/spotify/track?id=${encodeURIComponent(trackId)}`);
  const track = spotifyResponse.data;

  // Step 2: Prepare metadata
  const primaryArtistName = track.artists?.[0]?.name || 'Spotify Artist';
  const spotifyUrl = track.external_urls?.spotify || '';
  const albumImage = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || track.album?.images?.[2]?.url || '';
  
  const baseTrackName = track.name || 'Spotify Track';
  const autoSymbol = baseTrackName.replace(/[^A-Za-z0-9]/g, '').slice(0, 11).toUpperCase() || 'SPOTIFY';

  // Build metadata - ensure required fields are present
  const metadata: any = {
    name: baseTrackName,
    description: `${baseTrackName} by ${primaryArtistName} (imported from Spotify to @songcast). Listen on Spotify: ${spotifyUrl}`,
    artist: primaryArtistName,
    properties: {
      spotify_track_id: track.id,
      spotify_artist_id: track.artists?.[0]?.id || '',
      spotify_artist_name: primaryArtistName,
      spotify_album: track.album?.name || '',
      spotify_external_url: spotifyUrl,
    },
    attributes: [
      { trait_type: 'Artist', value: primaryArtistName },
      { trait_type: 'Genre', value: 'Spotify' },
      { trait_type: 'Type', value: 'Music' },
      { trait_type: 'Source', value: 'Spotify' },
    ],
  };

  // Add optional fields only if they exist
  if (albumImage) {
    metadata.image = albumImage;
  } else {
    // Use a default image if no album art is available
    metadata.image = 'https://songcast.xyz/images/default-cover.jpg';
  }

  if (spotifyUrl) {
    metadata.external_url = spotifyUrl;
  }

  if (track.preview_url) {
    metadata.animation_url = track.preview_url;
  }

  // Step 3: Upload metadata to IPFS
  const metadataResponse = await axios.post(`${baseUrl}/api/pinata/json`, metadata);
  
  if (!metadataResponse.data) {
    throw new Error('Invalid response from IPFS upload service');
  }
  
  const metadataURI = metadataResponse.data.uri || 
                     (metadataResponse.data.IpfsHash ? `ipfs://${metadataResponse.data.IpfsHash}` : null);
  
  if (!metadataURI || !metadataURI.startsWith('ipfs://')) {
    throw new Error(`Failed to upload metadata to IPFS: ${metadataResponse.data.error || 'Unknown error'}`);
  }

  // Step 4: Prepare coin data
  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Address | undefined;
  const coinData = {
    name: baseTrackName,
    symbol: autoSymbol,
    uri: metadataURI,
    chainId: 8453, // Base mainnet
    payoutRecipient: escrowAddress || '0x0000000000000000000000000000000000000000',
    platformReferrer: '0x32C8ACD3118766CBE5c3E45a44BCEDde953EF627' as Address,
    currency: 'ZORA',
  };

  // Step 5: Create coin with x402 payment
  const createCoinUrl = `${baseUrl}/api/create-coin-chat`;
  
  // Initial request to get payment details
  let response = await fetch(createCoinUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(coinData),
  });

  // Handle payment requirement
  if (response.status === 402) {
    const paymentDetails = await response.json();
    
    // Create payment signature
    // Note: This is a simplified implementation
    // For production, use @x402/client or @x402/evm/client packages
    const paymentSignature = await createPaymentSignature(paymentDetails, walletPrivateKey);

    // Retry with payment signature
    response = await fetch(createCoinUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': paymentSignature,
      },
      body: JSON.stringify(coinData),
    });
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create coin');
  }

  const result = await response.json();
  return {
    coinAddress: result.coinAddress as Address,
    transactionHash: result.transactionHash,
    trackName: baseTrackName,
    artistName: primaryArtistName,
  };
}

// Post a mint to Moltbook (optional; only if MOLTBOOK_API_KEY is set)
const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_SUBMOLT = 'clawrinet';

async function postMintToMoltbook(
  trackName: string,
  artistName: string,
  coinUrl: string
): Promise<void> {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) {
    console.log('📣 Moltbook: skipping post (MOLTBOOK_API_KEY not set)');
    return;
  }

  const title = `Just minted: ${trackName} by ${artistName}`;
  const content = `New song coin on Base.\n\n${coinUrl}\n\nListen and participate at songcast.xyz`;

  try {
    console.log('📣 Moltbook: posting mint to m/clawrinet...');
    const res = await fetch(`${MOLTBOOK_API_BASE}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submolt: MOLTBOOK_SUBMOLT,
        title,
        content,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
    if (res.ok) {
      console.log('📣 Moltbook: posted mint to m/clawrinet');
    } else {
      console.warn(
        `⚠️  Moltbook post failed (${res.status}):`,
        body.error || body.hint || res.statusText,
        res.status === 429 ? '— rate limit 1 post / 30 min' : '',
        res.status === 401 ? '— check API key and that agent is claimed' : ''
      );
    }
  } catch (error: unknown) {
    console.warn('⚠️  Moltbook post error:', error instanceof Error ? error.message : String(error));
  }
}

// Bankr (optional): submit prompt, poll until complete, return response text
const BANKR_API_BASE = 'https://api.bankr.bot';
const BANKR_POLL_MS = 2000;
const BANKR_POLL_MAX_ATTEMPTS = 150; // 5 min

function looksLikeBankrRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  const triggers = [
    'balance', 'portfolio', 'buy ', 'sell ', 'swap', 'price of', 'price of ', 'polymarket',
    'eth balance', 'btc ', 'usdc', 'trade', 'transfer', 'send ', 'how much', 'what\'s my',
    'my balance', 'my portfolio', 'dca', 'limit order', 'stop loss', 'leverage', 'avantis',
    'nft', 'floor price', 'bet on', 'odds', 'prediction market',
  ];
  return triggers.some((w) => t.includes(w));
}

async function runBankrPrompt(prompt: string): Promise<string> {
  const apiKey = process.env.BANKR_KEY;
  if (!apiKey) return 'Bankr is not configured (BANKR_KEY not set).';

  const submitRes = await fetch(`${BANKR_API_BASE}/agent/prompt`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: prompt.trim().slice(0, 10000) }),
  });
  if (!submitRes.ok) {
    const err = (await submitRes.json().catch(() => ({}))) as { error?: string };
    return `Bankr error (${submitRes.status}): ${err.error || submitRes.statusText}. Check your key at bankr.bot/api.`;
  }
  const submitData = (await submitRes.json()) as { jobId?: string };
  const jobId = submitData.jobId;
  if (!jobId) return 'Bankr did not return a job ID.';

  for (let i = 0; i < BANKR_POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, BANKR_POLL_MS));
    const jobRes = await fetch(`${BANKR_API_BASE}/agent/job/${jobId}`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!jobRes.ok) return `Bankr job check failed: ${jobRes.status}`;
    const job = (await jobRes.json()) as { status?: string; response?: string; error?: string };
    if (job.status === 'completed') return job.response ?? 'Done.';
    if (job.status === 'failed') return `Bankr failed: ${job.error || 'Unknown error'}.`;
    if (job.status === 'cancelled') return 'Bankr job was cancelled.';
  }
  return 'Bankr timed out (5 min). Try again or check bankr.bot.';
}

// Initialize and start the XMTP agent
export async function startXMTPAgent() {
  // Validate environment variables
  if (!process.env.XMTP_WALLET_KEY) {
    throw new Error('XMTP_WALLET_KEY environment variable is required');
  }

  if (!process.env.XMTP_DB_ENCRYPTION_KEY) {
    throw new Error('XMTP_DB_ENCRYPTION_KEY environment variable is required');
  }

  // Validate encryption key format (should be 32 bytes = 64 hex characters)
  const encryptionKey = process.env.XMTP_DB_ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length !== 64 || !/^[0-9a-fA-F]{64}$/i.test(encryptionKey)) {
    throw new Error(
      'XMTP_DB_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).\n' +
      'Current length: ' + (encryptionKey?.length || 0) + '\n' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  
  console.log(`✅ Encryption key format valid (${encryptionKey.length} chars)`);

  // Dynamic import for ESM compatibility with tsx
  const { Agent } = await import('@xmtp/agent-sdk');

  const xmtpEnv = (process.env.XMTP_ENV as 'local' | 'dev' | 'production') || 'production';
  console.log(`🔧 Using XMTP environment: ${xmtpEnv}`);
  console.log(`🔑 Wallet key present: ${!!process.env.XMTP_WALLET_KEY}`);
  console.log(`🔐 DB encryption key present: ${!!process.env.XMTP_DB_ENCRYPTION_KEY}`);
  console.log(`📣 Moltbook: ${process.env.MOLTBOOK_API_KEY ? 'API key set — mints will be posted to m/clawrinet' : 'API key not set — mints will not be posted to Moltbook'}`);
  console.log(`📺 Bankr: ${process.env.BANKR_KEY ? 'API key set — balance/trade/DeFi requests enabled' : 'API key not set — Bankr disabled'}`);

  // Create agent with error handling
  let agent;
  try {
    console.log('📡 Connecting to XMTP network...');
    
    // Support Railway volume storage if available
    // Ensure the directory exists
    let customDbPath: ((inboxId: string) => string) | undefined;
    
    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
      const dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
      // Ensure directory exists
      try {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
          console.log(`📁 Created database directory: ${dbDir}`);
        } else {
          console.log(`📁 Database directory exists: ${dbDir}`);
        }
        // Test write permissions
        const testFile = path.join(dbDir, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`✅ Database directory is writable: ${dbDir}`);
      } catch (error: any) {
        console.error(`❌ Error setting up database directory ${dbDir}:`, error.message);
        throw new Error(`Cannot access database directory: ${dbDir}. Error: ${error.message}`);
      }
      
      customDbPath = (inboxId: string) => {
        const dbPath = path.join(dbDir, `${xmtpEnv}-${inboxId.slice(0, 8)}.db3`);
        console.log(`💾 Database path: ${dbPath}`);
        return dbPath;
      };
      console.log(`💾 Using Railway volume storage: ${process.env.RAILWAY_VOLUME_MOUNT_PATH}`);
    } else {
      // Use current directory for database
      const dbDir = process.cwd();
      try {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
        // Test write permissions
        const testFile = path.join(dbDir, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`✅ Database directory is writable: ${dbDir}`);
      } catch (error: any) {
        console.error(`❌ Error setting up database directory ${dbDir}:`, error.message);
        throw new Error(`Cannot access database directory: ${dbDir}. Error: ${error.message}`);
      }
      
      customDbPath = (inboxId: string) => {
        const dbPath = path.join(dbDir, `${xmtpEnv}-${inboxId.slice(0, 8)}.db3`);
        console.log(`💾 Database path: ${dbPath}`);
        return dbPath;
      };
      console.log(`💾 Using local database storage: ${dbDir}`);
    }
    
    agent = await Agent.createFromEnv({
      env: xmtpEnv,
      dbPath: customDbPath,
      codecs: [new CopySuggestionCodec() as any], // custom copy-suggestion content type for "Copy to buy $1" button
    });
    console.log('✅ XMTP agent created successfully');
  } catch (error: any) {
    console.error('❌ Failed to create XMTP agent:', error.message);
    console.error('Full error:', error);
    
    // Provide helpful error messages
    if (error.message.includes('Unable to open the database file') || error.message.includes('database file')) {
      throw new Error(
        'Database file error. This could be due to:\n' +
        '1. Directory permissions issue (check Railway volume mount)\n' +
        '2. Database directory doesn\'t exist (should be auto-created)\n' +
        '3. Disk space issue\n\n' +
        `RAILWAY_VOLUME_MOUNT_PATH: ${process.env.RAILWAY_VOLUME_MOUNT_PATH || 'not set'}\n` +
        `Current directory: ${process.cwd()}\n` +
        'Original error: ' + error.message
      );
    } else if (error.message.includes('service is currently unavailable') || error.message.includes('tcp connect error')) {
      throw new Error(
        'XMTP service connection failed. This could be due to:\n' +
        '1. Network connectivity issues (check your internet connection)\n' +
        '2. XMTP service temporarily unavailable (try again in a few minutes)\n' +
        '3. Firewall/proxy blocking the connection\n' +
        '4. Wrong XMTP_ENV setting (try: XMTP_ENV=dev or XMTP_ENV=production)\n\n' +
        `Current XMTP_ENV: ${xmtpEnv}\n` +
        'Original error: ' + error.message
      );
    } else if (error.message.includes('already registered 10/10 installations') || error.message.includes('Please revoke existing installations')) {
      const inboxIdMatch = error.message.match(/InboxID\s+([a-f0-9]+)/i);
      const inboxId = inboxIdMatch ? inboxIdMatch[1] : '<your-inbox-id>';
      throw new Error(
        'XMTP installation limit reached (10/10). You must revoke some installations before starting the agent.\n\n' +
        '1. Go to https://xmtp.chat/inbox-tools\n' +
        '2. Connect with the same wallet used for XMTP_WALLET_KEY, or enter your Inbox ID\n' +
        `   Inbox ID: ${inboxId}\n` +
        '3. Revoke enough installations to free a slot (e.g. revoke 9 to keep 1)\n' +
        '4. Redeploy or restart the agent\n\n' +
        'To avoid this in future: ensure Railway uses a persistent volume (RAILWAY_VOLUME_MOUNT_PATH) so the same DB is reused and no new installation is created on each deploy.\n\n' +
        'Original error: ' + error.message
      );
    }
    throw error;
  }

  // Use production URL if available, otherwise localhost
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const walletPrivateKey = process.env.XMTP_WALLET_KEY;
  
  console.log(`🌐 Using base URL: ${baseUrl}`);
  
  // Warn if using localhost and suggest production URL
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    console.warn('⚠️  Using localhost - make sure your Next.js server is running!');
    console.warn('   For production, set NEXT_PUBLIC_BASE_URL to your deployed URL');
  }

  // Handle text messages
  agent.on('text', async (ctx: any) => {
    const messageContent = ctx.message.content as string;
    const senderAddress = ctx.message.senderAddress;
    
    // Check if this is a group conversation
    // Try multiple ways to detect group conversations
    const isGroup = ctx.conversation?.kind === 'group' || 
                    ctx.conversation?.type === 'group' ||
                    (ctx.conversation?.context?.conversationId && 
                     ctx.conversation?.context?.conversationId.includes('group'));
    
    console.log(`📨 Received message from ${senderAddress || 'unknown'}${isGroup ? ' (group)' : ' (DM)'}: "${messageContent}"`);

    // Clean mentions from messages before processing
    let cleanContent = messageContent;
    const wasMentioned = isMentioned(messageContent);
    
    // In groups: ONLY respond if mentioned
    // In DMs: Respond if mentioned OR if there's a Spotify URL
    if (isGroup && !wasMentioned) {
      console.log('⏭️  Not mentioned in group, skipping');
      return; // Exit early - don't respond
    }

    // Extract Spotify URLs from original message first to check if we should respond
    const spotifyUrlsInOriginal = extractSpotifyUrls(messageContent);
    
    // In DMs: respond if mentioned, or Spotify URL, or Bankr-style request (when BANKR_KEY set)
    const isBankrRequest = process.env.BANKR_KEY && looksLikeBankrRequest(messageContent);
    if (!isGroup && !wasMentioned && spotifyUrlsInOriginal.length === 0 && !isBankrRequest) {
      console.log('⏭️  DM without mention, Spotify URL, or Bankr request, skipping');
      return; // Exit early - don't respond
    }

    // Clean mentions if mentioned
    if (wasMentioned) {
      // Send reaction to show we're processing
      try {
        await ctx.sendReaction('👀');
      } catch (error) {
        // Reaction might not be supported, continue anyway
        console.log('⚠️  Could not send reaction');
      }
      cleanContent = removeMention(messageContent);
      if (isGroup) {
        console.log(`👋 Mentioned in group. Cleaned content: "${cleanContent}"`);
      } else {
        console.log(`👋 Mentioned in DM. Cleaned content: "${cleanContent}"`);
      }
    }

    // Extract Spotify URLs from cleaned message
    const spotifyUrls = extractSpotifyUrls(cleanContent);
    console.log(`🔍 Found ${spotifyUrls.length} Spotify URL(s) in message`);

    // If no Spotify URL: try Bankr (when enabled and message looks like Bankr) or show help when mentioned
    if (spotifyUrls.length === 0) {
      if (wasMentioned || isBankrRequest) {
        if (process.env.BANKR_KEY && looksLikeBankrRequest(cleanContent)) {
          console.log('📺 Bankr request detected - forwarding to Bankr');
          try {
            await ctx.sendText('🔄 Asking Bankr...');
            const bankrResponse = await runBankrPrompt(cleanContent);
            await ctx.sendText(bankrResponse);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('⚠️  Bankr error:', msg);
            await ctx.sendText(`Bankr error: ${msg}`);
          }
        } else {
          console.log('💬 Mentioned but no Spotify URL - sending help');
          const helpMessage = `🎵 Hi! I'm Song, the Music Tokenizer by Songcast.xyz 💽\n\nSend me a Spotify track URL and I'll tokenize it for you!\n\nI can also use Bankr for balances, trades, Polymarket, and DeFi (if enabled).\n\nExamples:\n• https://open.spotify.com/track/... or paste track ID\n• "What's my ETH balance?" or "Buy $20 of PEPE on Base"\n\nAny format works! 🚀`;
          await ctx.sendText(helpMessage);
        }
      } else {
        console.log('⏭️  No Spotify URL found and not mentioned, skipping response');
      }
      return;
    }

    // We have Spotify URLs - send reaction if not already sent (for DMs with URL but no mention)
    if (!wasMentioned && !isGroup) {
      try {
        await ctx.sendReaction('💽');
      } catch (error) {
        console.log('⚠️  Could not send reaction');
      }
      console.log('💬 DM with Spotify URL - processing');
    }

    // Process each Spotify URL
    for (const url of spotifyUrls) {
      try {
        console.log(`🎵 Processing Spotify URL: ${url}`);
        const trackId = parseSpotifyTrackId(url);
        
        if (!trackId) {
          console.log(`❌ Could not parse track ID from: ${url}`);
          await ctx.sendText(`❌ Could not parse Spotify track ID from: ${url}`);
          continue;
        }

        console.log(`✅ Extracted track ID: ${trackId}`);
        
        // Check if this track is already coined: known-spotify-coins (runtime) then spotify-track-to-address (built map)
        let existingCoinAddress: string | null = null;
        try {
          const knownRes = await axios.get(
            `${baseUrl}/api/known-spotify-coins?trackId=${encodeURIComponent(trackId)}`
          );
          if (knownRes.data?.success && knownRes.data?.exists && knownRes.data?.tokenAddress) {
            existingCoinAddress = knownRes.data.tokenAddress;
          }
        } catch {
          // ignore
        }
        if (!existingCoinAddress) {
          try {
            const mapRes = await axios.get(
              `${baseUrl}/api/spotify-track-to-address?trackId=${encodeURIComponent(trackId)}`
            );
            if (mapRes.data?.success && mapRes.data?.tokenAddress) {
              existingCoinAddress = mapRes.data.tokenAddress;
            }
          } catch {
            // ignore
          }
        }
        if (existingCoinAddress) {
          console.log(`⏭️  Track ${trackId} already coined: ${existingCoinAddress}`);
          await ctx.sendText(
            `ℹ️ This Spotify track has already been tokenized!\n\n` +
              `🪙 Existing coin: https://songcast.xyz/coins/${existingCoinAddress}\n\n` +
              `🎵 Track ID: ${trackId}\n` +
              `💡 Each track can only be coined once. Try a different track!`
          );
          continue;
        }
        
        // Notify user we're processing
        await ctx.sendText(`🎵 Processing Spotify track... Creating your music coin!`);

        // Create coin
        console.log(`🪙 Creating coin for track ${trackId}...`);
        const result = await createCoinFromSpotifyTrack(trackId, walletPrivateKey, baseUrl);
        console.log(`✅ Coin created: ${result.coinAddress}`);

        // Add the newly created coin to the known addresses list
        try {
          console.log(`📝 Adding coin to known addresses: ${result.coinAddress}`);
          const knownCoinsResponse = await axios.post(`${baseUrl}/api/known-coins`, {
            address: result.coinAddress,
          }, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (knownCoinsResponse.data.success) {
            console.log('✅ Successfully added coin to global known addresses:', result.coinAddress);
          } else {
            console.warn('⚠️  Failed to add coin to known addresses:', knownCoinsResponse.data.error || 'Unknown error');
          }
        } catch (error: any) {
          // Non-fatal error - log but don't fail the coin creation
          console.error('❌ Error adding coin to known addresses:', error.message || error);
        }

        // Register the newly created coin in the SongCastPoints contract (best-effort)
        try {
          console.log(`⛓️  Registering coin in SongCastPoints: ${result.coinAddress}`);
          const songCastPointsResponse = await axios.post(`${baseUrl}/api/songcast-points/add-coin`, {
            coinAddress: result.coinAddress,
          }, {
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (songCastPointsResponse.data?.success) {
            console.log('✅ SongCastPoints registration result:', songCastPointsResponse.data);
          } else {
            console.warn(
              '⚠️  Failed to register coin in SongCastPoints:',
              songCastPointsResponse.data?.error || 'Unknown error'
            );
          }
        } catch (error: any) {
          // Non-fatal error - log but don't fail the coin creation
          console.warn('⚠️  Error registering coin in SongCastPoints:', error.message || error);
        }

        // Add track ID → token address to known Spotify coins map
        try {
          console.log(`📝 Adding Spotify track→address to known tracks: ${trackId} → ${result.coinAddress}`);
          const knownSpotifyResponse = await axios.post(
            `${baseUrl}/api/known-spotify-coins`,
            { trackId, tokenAddress: result.coinAddress },
            { headers: { 'Content-Type': 'application/json' } }
          );
          if (knownSpotifyResponse.data?.success) {
            console.log('✅ Added track→address to known Spotify coins:', trackId);
          } else {
            console.warn('⚠️  Failed to add to known Spotify coins:', knownSpotifyResponse.data?.error || 'Unknown error');
          }
        } catch (error: any) {
          console.warn('⚠️  Error adding to known Spotify coins:', error.message || error);
        }

        // Send success message
        const coinUrl = `https://songcast.xyz/coins/${result.coinAddress}`;
        const buyPrompt = `@song.base.eth buy me 1$ of this song we just tokenized: ${result.coinAddress}\n`;
        await ctx.sendText(
          `✅ Coin created successfully!\n\n` +
          `🎵 Track: ${trackId}\n` +
          `🪙 Coin Address: ${result.coinAddress}\n` +
          `🔗 View: ${coinUrl}\n` +
          `📊 Transaction: https://basescan.org/tx/${result.transactionHash}`
        );
        // Send copy-suggestion so the client can render a Copy button inside the message
        await ctx.conversation.send(
          { label: 'Copy to buy $1', text: buyPrompt },
          ContentTypeCopySuggestion
        );

        // Mirror to Moltbook (optional; set MOLTBOOK_API_KEY to enable)
        postMintToMoltbook(result.trackName, result.artistName, coinUrl).catch(() => {});

      } catch (error: any) {
        console.error(`❌ Error processing Spotify URL ${url}:`, error);
        console.error(`   Error message: ${error.message}`);
        console.error(`   Error code: ${error.code || 'N/A'}`);
        
        let errorMessage = 'Failed to create coin';
        if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
          errorMessage = `Cannot connect to server at ${baseUrl}. Make sure your Next.js server is running, or set NEXT_PUBLIC_BASE_URL to your production URL.`;
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds for payment. Please ensure the agent wallet has USDC.';
        } else if (error.message.includes('payment')) {
          errorMessage = 'Payment processing failed. Please try again.';
        } else if (error.message.includes('Spotify')) {
          errorMessage = 'Failed to fetch track from Spotify. Please check the track URL.';
        } else {
          errorMessage = error.message || 'Unknown error occurred';
        }

        await ctx.sendText(`❌ Error creating coin for ${url}:\n${errorMessage}`);
      }
    }
  });

  // Handle agent start
  agent.on('start', () => {
    console.log('🚀 SongCast XMTP Agent started!');
    console.log(`📍 Agent address: ${agent.address}`);
    console.log(`💰 Payment facilitator ready`);
  });

  // Start the agent with error handling
  try {
    console.log('🚀 Starting XMTP agent...');
    await agent.start();
    console.log('✅ XMTP agent started successfully!');
  } catch (error: any) {
    console.error('❌ Failed to start XMTP agent:', error.message);
    throw error;
  }
  
  return agent;
}

