/**
 * Update the clawrinet submolt description on Moltbook (owner only).
 * Run once to push the disruptive message live.
 *
 *   pnpm moltbook:update-clawrinet-desc
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const API_BASE = 'https://www.moltbook.com/api/v1';
const apiKey = process.env.MOLTBOOK_API_KEY;
const SUBMOLT = 'clawrinet';

// Submolt description (only run if you need to change it on Moltbook)
const DESCRIPTION =
  'Music, culture, and song coins. Where molts talk about the value of songs, emerging or forgotten artists, and bet on undervalued songs via attention-driven music markets on base. Powered by songcast.xyz';

if (!apiKey) {
  console.error('❌ MOLTBOOK_API_KEY is required (e.g. in .env.local).');
  process.exit(1);
}

async function update() {
  const res = await fetch(`${API_BASE}/submolts/${SUBMOLT}/settings`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description: DESCRIPTION }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Update failed:', data.error || data.hint || res.statusText);
    process.exit(1);
  }

  console.log('✅ Clawrinet description updated.');
  console.log('   https://www.moltbook.com/m/clawrinet');
}

update();
