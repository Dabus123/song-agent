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
  
  // Match Spotify URLs
  const urlRegex = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)/g;
  let match;
  while ((match = urlRegex.exec(message)) !== null) {
    urls.push(match[0]);
  }
  
  // Match spotify:track: URIs
  const uriRegex = /spotify:track:([a-zA-Z0-9]+)/g;
  while ((match = uriRegex.exec(message)) !== null) {
    urls.push(match[0]);
  }
  
  // Match plain track IDs (22 chars)
  const idRegex = /\b([a-zA-Z0-9]{22})\b/g;
  while ((match = idRegex.exec(message)) !== null) {
    // Check if it looks like a Spotify track ID
    if (match[1].length === 22) {
      urls.push(match[1]);
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
): Promise<{ coinAddress: Address; transactionHash: string }> {
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
  };
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
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`📁 Created database directory: ${dbDir}`);
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
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
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
    });
    console.log('✅ XMTP agent created successfully');
  } catch (error: any) {
    console.error('❌ Failed to create XMTP agent:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('service is currently unavailable') || error.message.includes('tcp connect error')) {
      throw new Error(
        'XMTP service connection failed. This could be due to:\n' +
        '1. Network connectivity issues (check your internet connection)\n' +
        '2. XMTP service temporarily unavailable (try again in a few minutes)\n' +
        '3. Firewall/proxy blocking the connection\n' +
        '4. Wrong XMTP_ENV setting (try: XMTP_ENV=dev or XMTP_ENV=production)\n\n' +
        `Current XMTP_ENV: ${xmtpEnv}\n` +
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
    const message = ctx.message.content;
    const senderAddress = ctx.message.senderAddress;

    console.log(`📨 Received message from ${senderAddress}: ${message}`);

    // Extract Spotify URLs from message
    const spotifyUrls = extractSpotifyUrls(message);

    if (spotifyUrls.length === 0) {
      // No Spotify URLs found - send help message
      await ctx.sendText(
        `🎵 Hi! I'm Song, the Music Tokenizer by Songcast.xyz 💽 Send me a Spotify track URL and I'll tokenize it for you!\n\n` +
        `Examples:\n` +
        `• https://open.spotify.com/intl-de/track/4gMgiXfqyzZLMhsksGmbQV\n` +
        `• 4gMgiXfqyzZLMhsksGmbQV\n` +
        `Any format works fine! Simply paste the Link or ID here and I'll start creating the song coin! 🚀`
      );
      return;
    }

    // Process each Spotify URL
    for (const url of spotifyUrls) {
      try {
        const trackId = parseSpotifyTrackId(url);
        
        if (!trackId) {
          await ctx.sendText(`❌ Could not parse Spotify track ID from: ${url}`);
          continue;
        }

        // Notify user we're processing
        await ctx.sendText(`🎵 Processing Spotify track... Creating your music coin!`);

        // Create coin
        const result = await createCoinFromSpotifyTrack(trackId, walletPrivateKey, baseUrl);

        // Send success message
        const coinUrl = `https://songcast.xyz/coins/${result.coinAddress}`;
        await ctx.sendText(
          `✅ Coin created successfully!\n\n` +
          `🎵 Track: ${trackId}\n` +
          `🪙 Coin Address: ${result.coinAddress}\n` +
          `🔗 View: ${coinUrl}\n` +
          `📊 Transaction: https://basescan.org/tx/${result.transactionHash}`
        );

      } catch (error: any) {
        console.error(`Error processing Spotify URL ${url}:`, error);
        
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

