# Gork — Project Instructions

Tales of Planet Gork: a Discord bot that runs a persistent text RPG with an AI gamemaster.
One active campaign at a time per channel. Multiple `#planet-gork` channels across different servers
are supported — each runs independently. Players are scoped per channel (same Discord user on two
different servers has separate HP, inventory, and status effects).

## Stack

- **Runtime**: Node 22, ESM only (`"type": "module"`)
- **Bot**: discord.js v14
- **AI**: Anthropic SDK — `claude-haiku-4-5` for all GM and summary calls (cost-sensitive)
- **DB**: better-sqlite3 (synchronous SQLite, WAL mode, `gamestate.db`)
- **Images**: fal.ai
- **Lint**: `pnpm lint` (oxlint) — **zero warnings**
- **Types**: `npx tsc --noEmit` — **zero errors**

Run both before every commit.

## File map

```
src/
  index.ts       — startup, env validation, DB init, per-channel campaign status log
  bot.ts         — Discord client, message routing, !start / !thelatest handlers
  gork.ts        — chatbot (non-RPG @Gork mentions)
  image.ts       — fal.ai image generation
  latest.ts      — !thelatest: fetches 3-day history, summarises with Haiku, posts with jump links

  rpg/
    db.ts        — SQLite schema init + DB type export
    types.ts     — shared interfaces (Campaign, Monster, Player, TurnResult, etc.)
    rng.ts       — rollDice(), rollAction(), sample()
    queue.ts     — per-thread FIFO action queue
    gamemaster.ts — all Anthropic calls (resolveTurn, generateCampaign, generateLoot, summarizeCampaign)
    campaign.ts  — campaign lifecycle (start, complete) + processTurn
    monster.ts   — monster queries and HP mutation
    player.ts    — player upsert, HP, incapacitation, status effects, inventory
    loot.ts      — loot generation and award logic
    commands.ts  — !me, !party, !help handlers
    router.ts    — entry point for campaign thread messages
    data/
      seeds.ts   — SETTINGS, THREATS, TONES, WILD_CARDS arrays (~48 entries each)
```

## Key architecture

- `src/rpg/gamemaster.ts` — all Anthropic calls. GM output is always structured via `tool_use`.
  The system prompt has `cache_control: ephemeral` — don't move it or split it.
- `src/rpg/campaign.ts` — campaign lifecycle and turn processing. `processTurn` re-fetches
  the campaign from DB at entry to guard against stale state from the action queue.
- `src/rpg/queue.ts` — per-thread FIFO queue. All turns go through it. Never call `processTurn`
  directly from bot.ts.
- `src/rpg/router.ts` — entry point for all campaign thread messages. Commands (`!me`, `!party`,
  `!help`) work without `@Gork`; turns require a mention or reply.
- `src/latest.ts` — `!thelatest` works in any channel without `@Gork`. Keeps typing indicator
  alive during API call, caps input to ~40k chars, splits output to fit Discord's 2000 char limit.
- `gamestate.db` — never commit this file.

## Player scoping

Players are keyed on `(discord_id, channel_id)`. The same Discord user playing on two different
servers has completely separate HP, inventory, status effects, and incapacitation. `channel_id`
is the parent `#planet-gork` channel ID (not the thread ID).

## Campaign structure

Each campaign has: 3 normal monsters → 1 miniboss → 1 boss. Boss is always last.
Loot drops per kill: normal 0–1 mundane, miniboss 1–2 mundane + 0–1 special,
boss 1–3 mundane + 1–3 special + 1–2 exotic. Each item awarded to a random current participant.

## GM prompt rules

The system prompt in `gamemaster.ts` is the game's rulebook. Changes here affect gameplay directly.
- HP deltas, incapacitation, healing behavior, monster condition — all prompt-driven.
- Incapacitation is clamped to `[30_000, 300_000]` ms in code regardless of what the GM returns.
- Player HP floor is 1 (players cannot die). HP regen +5 per turn, capped at 100.
- Recovering from incapacitation restores HP to 60–100 and clears all status effects.
- Narrative hard limit: 2 sentences. The GM frequently tries to exceed this — do not loosen it.
- Haiku sometimes leaks `monster_hp_delta` into the narrative string as a `<parameter>` tag.
  The parser in `resolveTurn` detects and recovers this value before sanitizing the narrative.

## Environment variables

```
DISCORD_TOKEN
ANTHROPIC_API_KEY
FAL_KEY
ALLOWED_GUILD_IDS          # comma-separated guild IDs
PLANET_GORK_CHANNEL_IDS    # comma-separated channel IDs (one per #planet-gork across servers)
                           # also accepts legacy PLANET_GORK_CHANNEL_ID (single value)
```

## Dev workflow

```
pnpm dev     # tsx watch — restarts on save, keeps DB between restarts
pnpm lint    # oxlint
npx tsc --noEmit
```

To reset the game state: `rm gamestate.db` and restart.
Schema changes require a DB reset — `CREATE TABLE IF NOT EXISTS` won't alter existing tables.
