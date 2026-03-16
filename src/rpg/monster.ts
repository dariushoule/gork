import type { DB } from "./db.js";
import type { Monster, MonsterTier, GeneratedMonster } from "./types.js";
import { rollDice, sample } from "./rng.js";

function rowToMonster(row: Record<string, unknown>): Monster {
  return {
    id: row["id"] as number,
    campaign_id: row["campaign_id"] as number,
    name: row["name"] as string,
    tier: row["tier"] as MonsterTier,
    hp: row["hp"] as number,
    position: row["position"] as number,
    defeated: (row["defeated"] as number) === 1,
    defeated_at: (row["defeated_at"] as number | null) ?? null,
  };
}

/** Assigns positions: normals + minibosses shuffled, boss placed last. */
export function insertMonsters(db: DB, campaignId: number, generated: GeneratedMonster[]): void {
  const nonBoss = generated.filter((m) => m.tier !== "boss");
  const boss = generated.find((m) => m.tier === "boss");

  const shuffled = sample(nonBoss, nonBoss.length);

  const stmt = db.prepare(
    "INSERT INTO monsters (campaign_id, name, tier, hp, position) VALUES (?, ?, ?, 100, ?)"
  );

  for (let i = 0; i < shuffled.length; i++) {
    const m = shuffled[i]!;
    stmt.run(campaignId, m.name, m.tier, i + 1);
  }

  if (boss) {
    stmt.run(campaignId, boss.name, boss.tier, shuffled.length + 1);
  }
}

/** Returns the current active monster (lowest position, not defeated). */
export function getActiveMonster(db: DB, campaignId: number): Monster | null {
  const row = db.prepare(`
    SELECT * FROM monsters
    WHERE campaign_id = ? AND defeated = 0
    ORDER BY position ASC LIMIT 1
  `).get(campaignId);
  return row ? rowToMonster(row as Record<string, unknown>) : null;
}

export function getMonster(db: DB, id: number): Monster | null {
  const row = db.prepare("SELECT * FROM monsters WHERE id = ?").get(id);
  return row ? rowToMonster(row as Record<string, unknown>) : null;
}

/** Returns the next non-defeated monster after the given position, or null if none. */
export function getNextMonster(db: DB, campaignId: number, afterPosition: number): Monster | null {
  const row = db.prepare(`
    SELECT * FROM monsters
    WHERE campaign_id = ? AND defeated = 0 AND position > ?
    ORDER BY position ASC LIMIT 1
  `).get(campaignId, afterPosition);
  return row ? rowToMonster(row as Record<string, unknown>) : null;
}

/** Returns count of non-defeated monsters after the given position. */
export function countMonstersRemaining(db: DB, campaignId: number, afterPosition: number): number {
  const result = db.prepare(`
    SELECT COUNT(*) as cnt FROM monsters
    WHERE campaign_id = ? AND defeated = 0 AND position > ?
  `).get(campaignId, afterPosition) as { cnt: number };
  return result.cnt;
}

export function applyMonsterHpDelta(db: DB, monsterId: number, delta: number): Monster {
  db.prepare(`
    UPDATE monsters SET hp = MAX(0, hp + ?) WHERE id = ?
  `).run(delta, monsterId);
  return getMonster(db, monsterId)!;
}

export function defeatMonster(db: DB, monsterId: number): void {
  db.prepare(`
    UPDATE monsters SET defeated = 1, hp = 0, defeated_at = ? WHERE id = ?
  `).run(Date.now(), monsterId);
}

/** Returns true if all monsters in the campaign are defeated. */
export function allDefeated(db: DB, campaignId: number): boolean {
  const result = db.prepare(`
    SELECT COUNT(*) as cnt FROM monsters WHERE campaign_id = ? AND defeated = 0
  `).get(campaignId) as { cnt: number };
  return result.cnt === 0;
}

export function getLootCounts(tier: MonsterTier): { mundane: number; special: number; exotic: number } {
  switch (tier) {
    case "normal":
      return { mundane: rollDice(0, 1), special: 0, exotic: 0 };
    case "miniboss":
      return { mundane: rollDice(1, 2), special: rollDice(0, 1), exotic: 0 };
    case "boss":
      return { mundane: rollDice(1, 3), special: rollDice(1, 3), exotic: rollDice(1, 2) };
  }
}
