# Gork — Project Instructions

Tales of Planet Gork: a Discord bot that runs a persistent text RPG with an AI gamemaster.
One active campaign at a time, scoped to a single `#planet-gork` channel and its threads.

## Stack

- **Runtime**: Node 22, ESM only (`"type": "module"`)
- **Bot**: discord.js v14
- **AI**: Anthropic SDK — `claude-haiku-4-5` for all GM calls (cost-sensitive)
- **DB**: better-sqlite3 (synchronous SQLite, WAL mode, `gamestate.db`)
- **Images**: fal.ai
- **Lint**: `pnpm lint` (oxlint) — **zero warnings**
- **Types**: `npx tsc --noEmit` — **zero errors**

Run both before every commit.

## Key architecture

- `src/rpg/gamemaster.ts` — all Anthropic calls. GM output is always structured via `tool_use`.
  The system prompt has `cache_control: ephemeral` — don't move it or split it.
- `src/rpg/campaign.ts` — campaign lifecycle and turn processing. `processTurn` re-fetches
  the campaign from DB at entry to guard against stale state from the action queue.
- `src/rpg/queue.ts` — per-thread FIFO queue. All turns go through it. Never call `processTurn`
  directly from bot.ts.
- `src/rpg/router.ts` — entry point for all campaign thread messages. Commands (`!me`, `!party`)
  work without `@Gork`; turns require a mention or reply.
- `gamestate.db` — never commit this file.

## GM prompt rules

The system prompt in `gamemaster.ts` is the game's rulebook. Changes here affect gameplay directly.
- HP deltas, incapacitation, healing behavior, monster condition — all prompt-driven.
- Incapacitation is clamped to `[0, 300_000]` ms in code regardless of what the GM returns.
- Player HP floor is 1 (players cannot die).

## Environment variables

```
DISCORD_TOKEN
ANTHROPIC_API_KEY
FAL_KEY
ALLOWED_GUILD_IDS        # comma-separated
PLANET_GORK_CHANNEL_ID   # the #planet-gork channel id
```

## Dev workflow

```
pnpm dev     # tsx watch — restarts on save, keeps DB between restarts
pnpm lint    # oxlint
npx tsc --noEmit
```

To reset the game state: `rm gamestate.db` and restart.
