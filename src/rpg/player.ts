import type { DB } from "./db.js";
import type { Player, InventoryItem } from "./types.js";
import { sample } from "./rng.js";

function rowToPlayer(row: Record<string, unknown>): Player {
  return {
    id: row["id"] as number,
    discord_id: row["discord_id"] as string,
    channel_id: row["channel_id"] as string,
    display_name: row["display_name"] as string,
    hp: row["hp"] as number,
    incapacitated_until: (row["incapacitated_until"] as number | null) ?? null,
    incapacitation_reason: (row["incapacitation_reason"] as string | null) ?? null,
    created_at: row["created_at"] as number,
  };
}

export function upsertPlayer(db: DB, discordId: string, displayName: string, channelId: string): Player {
  db.prepare(`
    INSERT INTO players (discord_id, channel_id, display_name, hp, created_at)
    VALUES (?, ?, ?, 100, ?)
    ON CONFLICT(discord_id, channel_id) DO UPDATE SET display_name = excluded.display_name
  `).run(discordId, channelId, displayName, Date.now());

  const row = db.prepare("SELECT * FROM players WHERE discord_id = ? AND channel_id = ?").get(discordId, channelId);
  return rowToPlayer(row as Record<string, unknown>);
}

export function getPlayerById(db: DB, id: number): Player | null {
  const row = db.prepare("SELECT * FROM players WHERE id = ?").get(id);
  return row ? rowToPlayer(row as Record<string, unknown>) : null;
}

export function applyHpDelta(db: DB, playerId: number, delta: number): void {
  db.prepare(`
    UPDATE players SET hp = MAX(1, MIN(100, hp + ?)) WHERE id = ?
  `).run(delta, playerId);
}

export function setIncapacitation(
  db: DB,
  playerId: number,
  durationMs: number,
  reason: string
): void {
  const until = Date.now() + durationMs;
  db.prepare(`
    UPDATE players SET incapacitated_until = ?, incapacitation_reason = ? WHERE id = ?
  `).run(until, reason, playerId);
}

export function clearIncapacitation(db: DB, playerId: number): void {
  db.prepare(`
    UPDATE players SET incapacitated_until = NULL, incapacitation_reason = NULL WHERE id = ?
  `).run(playerId);
}

export function getInventory(db: DB, playerId: number): InventoryItem[] {
  const rows = db.prepare("SELECT * FROM inventory WHERE player_id = ?").all(playerId);
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r["id"] as number,
    player_id: r["player_id"] as number,
    name: r["name"] as string,
    tier: r["tier"] as InventoryItem["tier"],
    acquired_at: r["acquired_at"] as number,
  }));
}

export function addInventoryItem(
  db: DB,
  playerId: number,
  name: string,
  tier: InventoryItem["tier"]
): void {
  db.prepare("INSERT INTO inventory (player_id, name, tier, acquired_at) VALUES (?, ?, ?, ?)")
    .run(playerId, name, tier, Date.now());
}

export function removeInventoryItems(db: DB, itemIds: number[]): void {
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM inventory WHERE id IN (${placeholders})`).run(...itemIds);
}

export function getStatusEffects(db: DB, playerId: number): string[] {
  const rows = db.prepare("SELECT effect FROM status_effects WHERE player_id = ?").all(playerId);
  return (rows as Array<{ effect: string }>).map((r) => r.effect);
}

export function addStatusEffect(db: DB, playerId: number, effect: string): void {
  db.prepare("INSERT INTO status_effects (player_id, effect, applied_at) VALUES (?, ?, ?)")
    .run(playerId, effect, Date.now());
}

export function removeStatusEffects(db: DB, playerId: number, effects: string[]): void {
  if (effects.length === 0) return;
  for (const effect of effects) {
    db.prepare("DELETE FROM status_effects WHERE player_id = ? AND effect = ?")
      .run(playerId, effect);
  }
}

export function clearAllStatusEffects(db: DB, playerId: number): void {
  db.prepare("DELETE FROM status_effects WHERE player_id = ?").run(playerId);
}

/** Keeps up to `keep` randomly chosen items, removes the rest. Returns the kept items. */
export function trimInventory(db: DB, playerId: number, keep: number): InventoryItem[] {
  const all = getInventory(db, playerId);
  if (all.length <= keep) return all;
  const kept = sample(all, keep);
  const keptIds = new Set(kept.map((i) => i.id));
  const removeIds = all.filter((i) => !keptIds.has(i.id)).map((i) => i.id);
  removeInventoryItems(db, removeIds);
  return kept;
}

export function addCampaignParticipant(db: DB, campaignId: number, playerId: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO campaign_participants (campaign_id, player_id) VALUES (?, ?)
  `).run(campaignId, playerId);
}

export function getCampaignParticipants(db: DB, campaignId: number): Player[] {
  const rows = db.prepare(`
    SELECT p.* FROM players p
    JOIN campaign_participants cp ON cp.player_id = p.id
    WHERE cp.campaign_id = ?
  `).all(campaignId);
  return (rows as Record<string, unknown>[]).map(rowToPlayer);
}
