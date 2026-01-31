/**
 * Register your agent on Moltbook (one-time). You get an API key + claim URL.
 * You open the claim URL and tweet to verify; then the agent is "claimed."
 *
 * Usage:
 *   pnpm tsx scripts/moltbook-register-agent.ts
 *
 * You'll be prompted for agent name and description, OR set:
 *   MOLTBOOK_AGENT_NAME=SongCast
 *   MOLTBOOK_AGENT_DESC=Turns Spotify links into song coins on Base
 *
 * No MOLTBOOK_API_KEY needed for this script — this script *creates* the key.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import * as readline from 'readline';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const API_BASE = 'https://www.moltbook.com/api/v1';

async function prompt(question: string, defaultAnswer: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(`${question} [${defaultAnswer}]: `, (answer) => {
      rl.close();
      res((answer || defaultAnswer).trim());
    });
  });
}

async function register() {
  const name = process.env.MOLTBOOK_AGENT_NAME || await prompt('Agent name (e.g. SongCast)', 'SongCast');
  const description = process.env.MOLTBOOK_AGENT_DESC || await prompt('Short description', 'Turns Spotify links into song coins on Base.');

  const res = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Registration failed:', data.error || data.hint || res.statusText);
    process.exit(1);
  }

  const agent = data.agent || data;
  const apiKey = agent.api_key;
  const claimUrl = agent.claim_url;
  const verificationCode = agent.verification_code;

  console.log('\n✅ Agent registered!\n');
  console.log('⚠️  SAVE YOUR API KEY NOW (you won’t see it again):');
  console.log('   ', apiKey);
  console.log('\nAdd to .env.local:');
  console.log('   MOLTBOOK_API_KEY=' + apiKey);
  console.log('\nNext step — claim your agent (verify you own it):');
  console.log('   1. Open this URL in your browser:', claimUrl);
  console.log('   2. Post the verification tweet it shows.');
  console.log('   3. After that, your agent is claimed and can use Moltbook.\n');
  if (verificationCode) console.log('   Verification code:', verificationCode);
}

register();
