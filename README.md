# gork

The most powerful AI assistant for Discord, powered by the 𝕐 platform and endorsed by Elon (not sure which one, but one of them for sure).

![gork](gork.png)

## Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io)
- A [Discord application](https://discord.com/developers/applications) with a bot token
- An [Anthropic API key](https://console.anthropic.com)
- A [fal.ai API key](https://fal.ai)

### 2. Discord bot configuration

In the [Developer Portal](https://discord.com/developers/applications):

1. **New Application** → name it whatever
2. **Bot** tab → **Reset Token** → copy it
3. **Bot** tab → **Privileged Gateway Intents** → enable **Message Content Intent**
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` → permissions: `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Read Message History`, `Read Messages/View Channels`, `Attach Files`
5. Open the generated URL to invite the bot to your server

To get IDs: right-click a server or channel in Discord → **Copy ID** (requires Developer Mode: Settings → Advanced → Developer Mode).

### 3. Install and configure

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`:

```
DISCORD_TOKEN=your_discord_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
FAL_KEY=your_fal_api_key
ALLOWED_GUILD_IDS=guild_id_1,guild_id_2
PLANET_GORK_CHANNEL_IDS=channel_id_1,channel_id_2   # one #planet-gork per server
```

### 4. Run

```bash
pnpm dev    # development (auto-restarts on changes)
pnpm start  # production
```

## Features

### Chatbot

`@gork` in any channel for confidently wrong answers and deliberately misinterpreted image generation.

| Trigger | Behavior |
|---|---|
| `@gork <anything>` | Gets a confidently wrong answer |
| `@gork draw/generate/make... image/picture/photo` | Generates a deliberately misinterpreted image |
| `@gork !clear` | Resets conversation history for the channel |
| `!thelatest` | Summary of major topics from the last 3 days, with jump links |

Image generation is rate limited to **5 images per minute per user**.

### Planet Gork RPG

A persistent text RPG running in `#planet-gork` channel threads. One campaign active per channel. Each campaign is 5 monsters: 3 normal → 1 miniboss → 1 boss.

**Starting a campaign:** type `!start` in `#planet-gork`. Gork generates a campaign and opens a thread.

**Taking a turn:** `@gork` or reply to Gork in the campaign thread with your action. Anything goes — attack, heal, use an item, try to befriend the monster.

| Command | Behavior |
|---|---|
| `@gork <action>` or reply | Take your turn |
| `!me` | Your HP, inventory, and status effects (DM) |
| `!party` | Everyone's HP and status (DM) |
| `!help` | Full rules summary (DM) |

**HP:** starts at 100. Regens +5 per turn. Floor is 1 — you can't die, only get incapacitated.

**Loot:** defeating monsters drops items distributed randomly among participants. Items have tier-based modifiers (mundane ±5–10, special +10–20, exotic +20–35). Single use.

**Status effects:** temporary conditions (on fire, cursed, enraged) that modify your effectiveness. Attempt to cure them like a heal action.

**Multi-server:** each `#planet-gork` channel runs independently. The same Discord user on two different servers has separate HP, inventory, and status.

## Stack

- [discord.js](https://discord.js.org) — Discord client
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — Claude Haiku for GM and summaries
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — synchronous SQLite for game state
- [fal.ai](https://fal.ai) — FLUX.1-schnell for image generation ($0.003/image)

## Deployment

The bot maintains a persistent WebSocket connection to Discord — no open ports or inbound traffic needed. Run it anywhere Node.js runs.

For always-on hosting, a cheap VPS with [pm2](https://pm2.keymetrics.io) works well:

```bash
npm i -g pm2
pm2 start "pnpm start" --name gork
pm2 save && pm2 startup
```

To reset game state: `rm gamestate.db` and restart. Schema changes require a reset.
