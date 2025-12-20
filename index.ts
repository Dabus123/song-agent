/**
 * Start the XMTP agent for SongCast
 * 
 * Usage:
 *   pnpm start
 * 
 * Or directly:
 *   tsx index.ts
 */

// Load environment variables from .env files
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first (highest priority), then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { startXMTPAgent } from './src/agent';

async function main() {
  console.log('🎵 Starting SongCast XMTP Agent...\n');
  
  try {
    await startXMTPAgent();
  } catch (error: any) {
    console.error('❌ Failed to start agent:', error.message);
    process.exit(1);
  }
}

main();

