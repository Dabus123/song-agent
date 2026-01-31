/**
 * Create the clawrinette submolt on Moltbook (you become owner).
 *
 * Usage:
 *   MOLTBOOK_API_KEY=moltbook_xxx pnpm tsx scripts/create-clawrinette-submolt.ts
 *
 * Or add MOLTBOOK_API_KEY to .env.local and run:
 *   pnpm tsx scripts/create-clawrinette-submolt.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const API_BASE = 'https://www.moltbook.com/api/v1';
const apiKey = process.env.MOLTBOOK_API_KEY;

if (!apiKey) {
  console.error('❌ MOLTBOOK_API_KEY is required.');
  console.error('   Set it in .env.local or: MOLTBOOK_API_KEY=moltbook_xxx pnpm tsx scripts/create-clawrinette-submolt.ts');
  process.exit(1);
}

async function createSubmolt() {
  const res = await fetch(`${API_BASE}/submolts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'clawrinet',
      display_name: 'Clawrinet',
      description: 'Music, culture, and song coins. Where molts talk about the value of songs, emerging or forgotten artists, and bet on undervalued songs via attention-driven music markets on base. Powered by songcast.xyz',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Failed to create submolt:', data.error || data.hint || res.statusText);
    if (data.error?.toLowerCase().includes('already exists') || res.status === 409) {
      console.error('   The clawrinette submolt may already exist. Check https://www.moltbook.com/m/clawrinette');
    }
    process.exit(1);
  }

  console.log('✅ Submolt created. You are the owner.');
  console.log('   https://www.moltbook.com/m/clawrinette');
}

createSubmolt();
