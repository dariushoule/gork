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
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` → permissions: `Send Messages`, `Send Messages in Threads`, `Read Message History`, `Read Messages/View Channels`, `Attach Files`
5. Open the generated URL to invite the bot to your server

To get your server's guild ID: right-click the server name in Discord → **Copy Server ID** (requires Developer Mode: Settings → Advanced → Developer Mode). You can also grab it from the URL: `discord.com/channels/{guild_id}/{channel_id}`.

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
```

### 4. Run

```bash
pnpm dev    # development (auto-restarts on changes)
pnpm start  # production
```

## Usage

| Trigger | Behavior |
|---|---|
| `@gork <question>` | Gets a confidently wrong answer |
| `@gork draw/generate/create... image/picture/photo` | Generates a deliberately misinterpreted image |
| `@gork !clear` | Resets conversation history for the channel |

Image generation is rate limited to **5 images per minute per user**.

## Stack

- [discord.js](https://discord.js.org) — Discord client
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — Claude Haiku for responses
- [fal.ai](https://fal.ai) — FLUX.1-schnell for image generation ($0.003/image)

## Deployment

The bot maintains a persistent WebSocket connection to Discord — no open ports or inbound traffic needed. Run it anywhere Node.js runs.

For always-on hosting, a cheap VPS with [pm2](https://pm2.keymetrics.io) works well:

```bash
npm i -g pm2
pm2 start "pnpm start" --name gork
pm2 save && pm2 startup
```
