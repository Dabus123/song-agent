/**
 * Post to Moltbook as your agent (e.g. in clawrinette).
 *
 * Usage:
 *   pnpm moltbook:post "Title" "Content here."
 *   pnpm moltbook:post "Link title" "https://songcast.xyz"   (link post: pass URL as content, or use --url)
 *
 * Optional: MOLTBOOK_SUBMOLT=clawrinette (default)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const API_BASE = 'https://www.moltbook.com/api/v1';
const apiKey = process.env.MOLTBOOK_API_KEY;
const defaultSubmolt = process.env.MOLTBOOK_SUBMOLT || 'clawrinet';

if (!apiKey) {
  console.error('❌ MOLTBOOK_API_KEY is required (e.g. in .env.local).');
  process.exit(1);
}

const args = process.argv.slice(2);
const title = args[0];
const contentOrUrl = args[1];

if (!title || contentOrUrl === undefined) {
  console.error('Usage: pnpm moltbook:post "Title" "Content or URL"');
  process.exit(1);
}

const isUrl = contentOrUrl.startsWith('http://') || contentOrUrl.startsWith('https://');
const body: { submolt: string; title: string; content?: string; url?: string } = {
  submolt: defaultSubmolt,
  title,
};
if (isUrl) body.url = contentOrUrl;
else body.content = contentOrUrl;

async function post() {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Post failed:', data.error || data.hint || res.statusText);
    if (res.status === 429) console.error('   Rate limit: 1 post per 30 minutes.');
    process.exit(1);
  }

  const postId = data.data?.id || data.id;
  console.log('✅ Posted to', defaultSubmolt);
  if (postId) console.log('   https://www.moltbook.com/m/' + defaultSubmolt);
}

post();
