import type { DB } from "./db.js";
import type { LootDrop, GeneratedLoot } from "./types.js";
import { sample } from "./rng.js";

export function insertLoot(db: DB, monsterId: number, items: GeneratedLoot[]): LootDrop[] {
  const stmt = db.prepare("INSERT INTO loot (monster_id, name, tier) VALUES (?, ?, ?)");
  for (const item of items) {
    stmt.run(monsterId, item.name, item.tier);
  }
  const rows = db.prepare("SELECT * FROM loot WHERE monster_id = ? AND awarded_to IS NULL")
    .all(monsterId);
  return (rows as Record<string, unknown>[]).map(rowToLoot);
}

/** Randomly distributes loot among participants. Returns map of playerId → items awarded. */
export function awardLoot(
  db: DB,
  lootDrops: LootDrop[],
  participantIds: number[]
): Map<number, LootDrop[]> {
  if (participantIds.length === 0 || lootDrops.length === 0) return new Map();

  const awards = new Map<number, LootDrop[]>();
  for (let i = 0; i < lootDrops.length; i++) {
    const drop = lootDrops[i]!;
    const recipientId = sample(participantIds, 1)[0]!;

    db.prepare("UPDATE loot SET awarded_to = ? WHERE id = ?").run(recipientId, drop.id);
    db.prepare("INSERT INTO inventory (player_id, name, tier, acquired_at) VALUES (?, ?, ?, ?)")
      .run(recipientId, drop.name, drop.tier, Date.now());

    const existing = awards.get(recipientId) ?? [];
    existing.push({ ...drop, awarded_to: recipientId });
    awards.set(recipientId, existing);
  }

  return awards;
}

function rowToLoot(row: Record<string, unknown>): LootDrop {
  return {
    id: row["id"] as number,
    monster_id: row["monster_id"] as number,
    name: row["name"] as string,
    tier: row["tier"] as LootDrop["tier"],
    awarded_to: (row["awarded_to"] as number | null) ?? null,
  };
}
