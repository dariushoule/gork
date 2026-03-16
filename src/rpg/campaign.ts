import type { ThreadChannel, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import type { DB } from "./db.js";
import type { Campaign, TurnHistoryEntry, Monster } from "./types.js";
import {
  upsertPlayer,
  getPlayerById,
  applyHpDelta,
  setIncapacitation,
  clearIncapacitation,
  clearAllStatusEffects,
  trimInventory,
  addStatusEffect,
  removeStatusEffects,
  removeInventoryItems,
  getInventory,
  getStatusEffects,
  addCampaignParticipant,
  getCampaignParticipants,
} from "./player.js";
import {
  insertMonsters,
  getActiveMonster,
  getNextMonster,
  countMonstersRemaining,
  applyMonsterHpDelta,
  defeatMonster,
  allDefeated,
  getLootCounts,
} from "./monster.js";
import { insertLoot, awardLoot } from "./loot.js";
import { generateCampaign, generateLoot, summarizeCampaign, resolveTurn } from "./gamemaster.js";
import { rollAction, rollDice } from "./rng.js";
import type { Message } from "discord.js";

// ── Campaign DB helpers ────────────────────────────────────────────────────────

export function getActiveCampaign(db: DB): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE status = 'active' LIMIT 1").get();
  return row ? rowToCampaign(row as Record<string, unknown>) : null;
}

export function getCampaignByThreadId(db: DB, threadId: string): Campaign | null {
  const row = db.prepare("SELECT * FROM campaigns WHERE thread_id = ?").get(threadId);
  return row ? rowToCampaign(row as Record<string, unknown>) : null;
}

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row["id"] as number,
    title: row["title"] as string,
    description: row["description"] as string,
    thread_id: (row["thread_id"] as string | null) ?? null,
    status: row["status"] as Campaign["status"],
    created_at: row["created_at"] as number,
    completed_at: (row["completed_at"] as number | null) ?? null,
  };
}

function getTurnHistory(db: DB, campaignId: number): TurnHistoryEntry[] {
  const rows = db.prepare(
    "SELECT * FROM turn_history WHERE campaign_id = ? ORDER BY turn_number ASC"
  ).all(campaignId);
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r["id"] as number,
    campaign_id: r["campaign_id"] as number,
    player_name: r["player_name"] as string,
    player_action: r["player_action"] as string,
    gm_narrative: r["gm_narrative"] as string,
    turn_number: r["turn_number"] as number,
    created_at: r["created_at"] as number,
  }));
}

function insertTurnHistory(
  db: DB,
  campaignId: number,
  playerName: string,
  playerAction: string,
  gmNarrative: string
): void {
  const countRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM turn_history WHERE campaign_id = ?"
  ).get(campaignId) as { cnt: number };
  const nextTurn = countRow.cnt + 1;
  db.prepare(`
    INSERT INTO turn_history (campaign_id, player_name, player_action, gm_narrative, turn_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(campaignId, playerName, playerAction, gmNarrative, nextTurn, Date.now());
}

function getRecentCampaignSummaries(db: DB): string[] {
  const rows = db.prepare(
    "SELECT summary FROM campaign_summaries ORDER BY id DESC LIMIT 4"
  ).all() as Array<{ summary: string }>;
  return rows.map((r) => r.summary).reverse();
}

// ── Campaign lifecycle ─────────────────────────────────────────────────────────

export async function startNewCampaign(db: DB, channel: TextChannel): Promise<void> {
  console.log("[RPG] generating new campaign...");
  const summaries = getRecentCampaignSummaries(db);
  const generated = await generateCampaign(summaries).catch((err: unknown) => {
    console.error("[RPG] generateCampaign failed:", err);
    throw err;
  });
  console.log(`[RPG] campaign generated: "${generated.title}" — ${generated.monsters.length} monsters`);

  const campaignId = db.transaction(() => {
    const row = db.prepare(`
      INSERT INTO campaigns (title, description, created_at) VALUES (?, ?, ?)
    `).run(generated.title, generated.description, Date.now());
    const id = row.lastInsertRowid as number;
    insertMonsters(db, id, generated.monsters);
    return id;
  })();

  const thread = await channel.threads.create({
    name: `Campaign: ${generated.title}`,
    type: ChannelType.PublicThread,
    reason: "New Planet Gork campaign",
  });

  db.prepare("UPDATE campaigns SET thread_id = ? WHERE id = ?").run(thread.id, campaignId);

  const firstMonster = getActiveMonster(db, campaignId);
  const firstMonsterLine = firstMonster
    ? `\n\nYour first enemy: **${firstMonster.name}**`
    : "";

  await thread.send(
    `# ${generated.title}\n\n${generated.description}${firstMonsterLine}\n\n` +
    `*@mention Gork or reply to his messages to take your turn. Use \`!me\` for your stats and \`!party\` for the group.*`
  );

  await channel.send(
    `⚔️ **A new campaign has begun: ${generated.title}**\nJoin the battle in ${thread}!`
  );
}

async function completeCampaign(
  db: DB,
  campaign: Campaign,
  thread: ThreadChannel
): Promise<void> {
  console.log(`[RPG] completing campaign: "${campaign.title}"`);
  const history = getTurnHistory(db, campaign.id);
  const participants = getCampaignParticipants(db, campaign.id);

  let summary: string;
  let closingNarrative: string;
  try {
    ({ summary, closingNarrative } = await summarizeCampaign(campaign.title, campaign.description, history));
  } catch (err) {
    console.error(`[RPG] summarizeCampaign failed — storing fallback:`, err);
    summary = `${campaign.title}: campaign completed.`;
    closingNarrative = `The campaign is over. Planet Gork endures.`;
  }

  db.prepare(`
    INSERT OR REPLACE INTO campaign_summaries (campaign_id, summary) VALUES (?, ?)
  `).run(campaign.id, summary);

  db.prepare(`
    UPDATE campaigns SET status = 'completed', completed_at = ? WHERE id = ?
  `).run(Date.now(), campaign.id);

  // Post the closing narrative
  await thread.send(`🏆 **${campaign.title}** — *Campaign Complete*\n\n${closingNarrative}`);

  // Clean up each participant: trim inventory to 3, clear status effects and incapacitation
  const lootLines: string[] = ["*The adventurers grab what they can carry and prepare for the next fight.*\n"];
  for (const p of participants) {
    const kept = trimInventory(db, p.id, 3);
    clearAllStatusEffects(db, p.id);
    clearIncapacitation(db, p.id);
    if (kept.length > 0) {
      lootLines.push(`**${p.display_name}** pockets: ${kept.map((i) => i.name).join(", ")}`);
    } else {
      lootLines.push(`**${p.display_name}** heads out empty-handed.`);
    }
  }
  await thread.send(lootLines.join("\n"));

  // Always fetch parent from API — thread.parent relies on cache and is null after a restart
  const parentId = thread.parentId;
  if (parentId) {
    const parent = await thread.client.channels.fetch(parentId).catch(() => null);
    if (parent?.isTextBased() && parent.type === ChannelType.GuildText) {
      await startNewCampaign(db, parent as TextChannel);
    } else {
      console.error(`[RPG] could not fetch parent channel ${parentId} to start next campaign`);
    }
  }
}

// ── Turn processing ────────────────────────────────────────────────────────────

export async function processTurn(
  db: DB,
  message: Message,
  _campaign: Campaign
): Promise<void> {
  const thread = message.channel as ThreadChannel;
  const content = message.content.trim().slice(0, 500);

  // Re-fetch from DB to guard against stale state (previous queued turn may have completed campaign)
  const campaign = getCampaignByThreadId(db, thread.id);
  if (!campaign || campaign.status !== "active") return;

  const tag = `[RPG][${campaign.title}][@${message.author.username}]`;

  console.log(`${tag} action: "${content}"`);

  // 1. Upsert player and register as participant
  let player = upsertPlayer(db, message.author.id, message.author.displayName);
  addCampaignParticipant(db, campaign.id, player.id);

  // 2. Check incapacitation
  if (player.incapacitated_until && Date.now() < player.incapacitated_until) {
    const remaining = Math.ceil((player.incapacitated_until - Date.now()) / 1000);
    console.log(`${tag} incapacitated — ${remaining}s remaining (${player.incapacitation_reason ?? "unknown"})`);
    await thread.send(
      `${message.author} is incapacitated by ${player.incapacitation_reason ?? "unknown"} — ${remaining}s remaining. ` +
      `Another player can try to help!`
    );
    return;
  }

  // 2b. Recover from expired incapacitation — restore HP to 60-100
  if (player.incapacitated_until !== null) {
    const recoveryHp = rollDice(60, 100);
    db.transaction(() => {
      clearIncapacitation(db, player.id);
      clearAllStatusEffects(db, player.id);
      applyHpDelta(db, player.id, recoveryHp - player.hp);
    })();
    console.log(`${tag} incapacitation expired — HP restored to ${recoveryHp}`);
    player = getPlayerById(db, player.id) ?? player;
    await thread.send(`${message.author} recovers from their ordeal, HP restored to **${recoveryHp}**.`);
  }

  // 3. Regen HP (+5 per round, capped at 100)
  applyHpDelta(db, player.id, 5);

  // 4. Get active monster
  const monster = getActiveMonster(db, campaign.id);
  if (!monster) {
    await completeCampaign(db, campaign, thread);
    return;
  }

  // 5. Roll — generate a pool so multi-step actions each get their own roll
  const rolls = [rollAction(), rollAction(), rollAction(), rollAction()];
  console.log(`${tag} rolls: [${rolls.map((r) => `${r.value}(${r.descriptor})`).join(", ")}] | monster: ${monster.name} [${monster.hp} HP] | player: [${player.hp} HP]`);

  // 6. Assemble turn context
  const inventory = getInventory(db, player.id);
  const statusEffects = getStatusEffects(db, player.id);
  const participants = getCampaignParticipants(db, campaign.id);
  const turnHistory = getTurnHistory(db, campaign.id);
  const remaining = countMonstersRemaining(db, campaign.id, monster.position);
  const nextMonster = getNextMonster(db, campaign.id, monster.position);

  const ctx = {
    campaign: { id: campaign.id, title: campaign.title, description: campaign.description },
    monster: { id: monster.id, name: monster.name, tier: monster.tier, hp: monster.hp },
    monstersRemaining: remaining,
    nextMonsterName: nextMonster?.name ?? null,
    player: {
      id: player.id,
      name: player.display_name,
      hp: Math.min(100, player.hp + 5), // reflect regen already applied to DB
      inventory,
      statusEffects,
    },
    allParticipants: await buildParticipantSummaries(db, participants),
    turnHistory,
    rolls,
    playerAction: content,
  };

  // 7. Resolve with GM
  await thread.sendTyping();
  let result: Awaited<ReturnType<typeof resolveTurn>>;
  try {
    result = await resolveTurn(ctx);
  } catch (err) {
    console.error(`${tag} resolveTurn failed:`, err);
    await thread.send(`${message.author} — the Gamemaster is unavailable. Try again in a moment.`);
    return;
  }

  if (result.unclearAction) {
    console.log(`${tag} unclear action — skipped`);
    await thread.send(`${message.author} — not sure what you're doing. Clarify your action!`);
    return;
  }

  const monsterHpAfter = Math.max(0, monster.hp + result.monsterHpDelta);
  const playerHpAfter = Math.max(1, Math.min(100, player.hp + result.playerHpDelta));
  console.log(`${tag} GM resolved:`);
  console.log(`  monster hp:  ${monster.hp} → ${monsterHpAfter} (${result.monsterHpDelta})`);
  console.log(`  player hp:   ${player.hp} → ${playerHpAfter} (${result.playerHpDelta})`);
  if (result.itemsConsumed.length > 0)
    console.log(`  items used:  [${result.itemsConsumed.join(", ")}]`);
  if (result.statusEffectsAdded.length > 0)
    console.log(`  status +: ${result.statusEffectsAdded.join(", ")}`);
  if (result.statusEffectsRemoved.length > 0)
    console.log(`  status -: ${result.statusEffectsRemoved.join(", ")}`);
  if (result.incapacitationDurationMs > 0)
    console.log(`  incapacitated: ${result.incapacitationDurationMs / 1000}s — ${result.incapacitationReason}`);
  for (const fx of result.allyEffects)
    console.log(`  ally ${fx.playerName}: hp ${fx.hpDelta > 0 ? "+" : ""}${fx.hpDelta}${fx.statusEffectsAdded.length ? ` +[${fx.statusEffectsAdded.join(", ")}]` : ""}${fx.statusEffectsRemoved.length ? ` -[${fx.statusEffectsRemoved.join(", ")}]` : ""}`);
  console.log(`  narrative: "${result.narrative.slice(0, 120)}${result.narrative.length > 120 ? "…" : ""}"`);

  const clampedIncapMs = result.incapacitationDurationMs > 0
    ? Math.min(300_000, Math.max(30_000, result.incapacitationDurationMs))
    : 0;

  // 8. Apply results in a transaction
  const monsterDefeated = monsterHpAfter <= 0;
  // Build name → player lookup for ally effects
  const participantsByName = new Map(participants.map((p) => [p.display_name, p]));

  db.transaction(() => {
    applyMonsterHpDelta(db, monster.id, result.monsterHpDelta);
    if (monsterDefeated) defeatMonster(db, monster.id);
    applyHpDelta(db, player.id, result.playerHpDelta);
    removeInventoryItems(db, result.itemsConsumed);
    for (const e of result.statusEffectsAdded) addStatusEffect(db, player.id, e);
    removeStatusEffects(db, player.id, result.statusEffectsRemoved);
    if (clampedIncapMs > 0) {
      setIncapacitation(db, player.id, clampedIncapMs, result.incapacitationReason);
    }
    for (const fx of result.allyEffects) {
      const ally = participantsByName.get(fx.playerName);
      if (!ally) continue;
      if (fx.hpDelta !== 0) applyHpDelta(db, ally.id, fx.hpDelta);
      for (const e of fx.statusEffectsAdded) addStatusEffect(db, ally.id, e);
      removeStatusEffects(db, ally.id, fx.statusEffectsRemoved);
    }
  })();

  // 9. Post narrative + player status summary
  const updatedStatusEffects = [
    ...statusEffects.filter((e) => !result.statusEffectsRemoved.includes(e)),
    ...result.statusEffectsAdded,
  ];
  const statusLine = updatedStatusEffects.length > 0
    ? ` | ${updatedStatusEffects.join(", ")}`
    : "";
  await thread.send(result.narrative);

  const summaryLines = [`${message.author} — ❤️ **${playerHpAfter} HP**${statusLine}`];
  for (const fx of result.allyEffects) {
    if (fx.hpDelta === 0) continue;
    const ally = participantsByName.get(fx.playerName);
    if (!ally) continue;
    const allyHpAfter = Math.min(100, Math.max(1, ally.hp + fx.hpDelta));
    const delta = fx.hpDelta > 0 ? `+${fx.hpDelta}` : String(fx.hpDelta);
    summaryLines.push(`**${fx.playerName}** — ❤️ **${allyHpAfter} HP** (${delta})`);
  }
  await thread.send(summaryLines.join("\n"));

  // 10. Handle loot and next monster announcement if monster was defeated
  if (monsterDefeated) {
    console.log(`${tag} monster defeated: ${monster.name}`);
    await handleMonsterDeath(db, thread, monster, participants);
    const nextActive = getActiveMonster(db, campaign.id);
    if (nextActive) {
      await thread.send(`⚔️ Next up: **${nextActive.name}** (${nextActive.tier})`);
    }
  }

  // 11. Save turn to history
  insertTurnHistory(db, campaign.id, player.display_name, content, result.narrative);

  // 12. Check campaign completion
  if (allDefeated(db, campaign.id)) {
    console.log(`${tag} all monsters defeated — completing campaign`);
    await completeCampaign(db, campaign, thread);
  }
}

async function buildParticipantSummaries(
  db: DB,
  participants: Awaited<ReturnType<typeof getCampaignParticipants>>
): Promise<Array<{ name: string; hp: number; statusEffects: string[] }>> {
  return participants.map((p) => ({
    name: p.display_name,
    hp: p.hp,
    statusEffects: getStatusEffects(db, p.id),
  }));
}

async function handleMonsterDeath(
  db: DB,
  thread: ThreadChannel,
  monster: Monster,
  participants: ReturnType<typeof getCampaignParticipants>
): Promise<void> {
  const counts = getLootCounts(monster.tier);
  const totalItems = counts.mundane + counts.special + counts.exotic;

  if (totalItems === 0) {
    await thread.send(`💀 **${monster.name}** has been defeated! No loot dropped.`);
    return;
  }

  let generatedLoot: Awaited<ReturnType<typeof generateLoot>>;
  try {
    generatedLoot = await generateLoot(monster.name, monster.tier, counts);
  } catch (err) {
    console.error(`[RPG] generateLoot failed for ${monster.name}:`, err);
    await thread.send(`💀 **${monster.name}** has been defeated! (Loot generation failed.)`);
    return;
  }
  const lootDrops = insertLoot(db, monster.id, generatedLoot);
  const awards = awardLoot(db, lootDrops, participants.map((p) => p.id));

  const lootLines: string[] = [`💀 **${monster.name}** has been defeated! Loot drops:\n`];

  for (const p of participants) {
    const items = awards.get(p.id) ?? [];
    if (items.length > 0) {
      lootLines.push(`**${p.display_name}** received:`);
      for (const item of items) {
        lootLines.push(`  • [${item.tier}] ${item.name}`);
      }
    }
  }

  await thread.send(lootLines.join("\n"));
}
