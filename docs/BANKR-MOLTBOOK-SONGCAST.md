# Bankr: Moltbook/Clawrinet + SongCast Agent

Use [Bankr](https://bankr.bot) (AI-powered crypto trading and DeFi via natural language) in Moltbook/Clawrinet and from the SongCast song.base.eth agent.

**Skills repo:** [github.com/BankrBot/openclaw-skills](https://github.com/BankrBot/openclaw-skills)  
**API keys:** [bankr.bot/api](https://bankr.bot/api) (create key with **Agent API** access)

---

## 1. Use Bankr inside Moltbook / Clawrinet (Moltbot)

Give Moltbot the openclaw-skills repo and install the Bankr skill; then set your API key.

### How do I give Moltbot the URL?

**In chat** (Moltbook, OpenClaw WebChat, or wherever you talk to your Moltbot):

Paste the repo URL and ask the agent to install the skill. For example:

- *"Install the skill from https://github.com/BankrBot/openclaw-skills"*
- *"Add the Bankr skill from this repo: https://github.com/BankrBot/openclaw-skills"*

If your agent supports skill install from a URL, it will use that repo and let you pick a skill — choose **bankr**.

### After the skill is installed

1. Set your Bankr API key at [bankr.bot/api](https://bankr.bot/api) (create a key with **Agent API** enabled).
2. Configure the skill (per skill instructions, e.g. save key to `~/.clawdbot/skills/bankr/config.json` or set `BANKR_KEY` / `X-API-Key` as required).

After that, in Moltbook/Clawrinet (or any channel where that Moltbot runs), you can ask for balances, prices, trades, Polymarket, DeFi, etc., and the agent will use Bankr to fulfill the request.

---

## 2. Use Bankr from the SongCast song.base.eth agent (XMTP)

The SongCast XMTP agent (song.base.eth) can optionally run Bankr when you send it a trading/portfolio/DeFi-style message.

### Enable Bankr on the SongCast agent

1. Create an API key at [bankr.bot/api](https://bankr.bot/api) with **Agent API** access.
2. Set **`BANKR_KEY`** in the agent environment (e.g. Railway env vars or `.env.local`):
   ```
   BANKR_KEY=bk_your_key_here
   ```
3. Redeploy or restart the agent.

### What the agent does

- **Spotify URL in message** → Same as before: mints a song coin and (if configured) posts to Moltbook.
- **No Spotify URL, but message looks like a Bankr request** (e.g. “balance”, “portfolio”, “buy”, “sell”, “swap”, “price of”, “polymarket”) and **`BANKR_KEY`** is set → Agent sends the message to Bankr’s API, waits for the job to complete, and replies with Bankr’s response (e.g. balance, trade result, price).
- **Otherwise** (e.g. “hi” or “help” with no Spotify link) → Agent sends the usual SongCast help (paste a Spotify link to mint).

So you can DM song.base.eth on XMTP with both “mint this track” and “what’s my ETH balance?” / “buy $20 of PEPE on Base” and get SongCast + Bankr in one agent.

### Bankr API (reference)

- **Submit:** `POST https://api.bankr.bot/agent/prompt` with header `X-API-Key: YOUR_KEY` and body `{"prompt": "..."}` → returns `jobId`.
- **Poll:** `GET https://api.bankr.bot/agent/job/{jobId}` with `X-API-Key` → poll every ~2s until `status` is `completed`, `failed`, or `cancelled`.
- **Result:** Use the `response` field from the job when `status === 'completed'`.

---

## Quick reference

| Goal | Where | How |
|------|--------|-----|
| Use Bankr in Moltbook/Clawrinet | Moltbot | Install skill from `https://github.com/BankrBot/openclaw-skills`, set key at [bankr.bot/api](https://bankr.bot/api). |
| Use Bankr from SongCast agent | XMTP (song.base.eth) | Set `BANKR_KEY` in agent env; send trading/portfolio/DeFi messages in DM (or when mentioning in group). |

**API key:** [bankr.bot/api](https://bankr.bot/api) — enable **Agent API** on the key.
