import type { Message } from "discord.js";
import type { DB } from "./db.js";
import {
  upsertPlayer,
  getInventory,
  getStatusEffects,
  getCampaignParticipants,
} from "./player.js";
import type { Campaign } from "./types.js";

const HELP_TEXT = `**⚔️ Tales of Planet Gork**
A RPG-inspired text battler, check the latest thread under #planet-gork.

**Taking a turn**
@mention Gork or reply to his message with your action (fight, heal, cure).

**HP**
You have it and the monster has it. If yours hits 0, you faint and miss a turn while you recover. If the monster's hits 0, you win and move on to the next fight.

**Healing**
Explicitly attempt to heal (tend wounds, bandage, drink something, cast a spell). Roll is biased toward success. The GM will tell you how much you recovered.

**Status effects**
Conditions like "on fire" or "one eye swollen shut" reduce your attack and heal effectiveness until removed. Buffs (like "enraged") boost it. Explicitly attempt to cure a status effect ("I try to rinse off the space grease", "I dispel the curse") and the GM will resolve it like a heal.

**Loot**
Defeating monsters drops loot distributed randomly among participants. Check your inventory with \`!me\`. Loot is single use, be creative and don't hold onto it for too long!

**Commands**
\`!me\` — your HP, inventory, and status effects (DMed)
\`!party\` — everyone's HP and status (DMed)
\`!help\` — this message`;

export async function handleHelpCommand(message: Message): Promise<void> {
  try {
    const dm = await message.author.createDM();
    await dm.send(HELP_TEXT);
  } catch {
    if ("send" in message.channel) {
      await message.channel.send(`${message.author}: your DMs are closed — can't send help.`);
    }
  }
}

export async function handleMeCommand(db: DB, message: Message): Promise<void> {
  const player = upsertPlayer(db, message.author.id, message.author.displayName);
  const inventory = getInventory(db, player.id);
  const statusEffects = getStatusEffects(db, player.id);

  const incapText = player.incapacitated_until && Date.now() < player.incapacitated_until
    ? `⛓️ Incapacitated: ${player.incapacitation_reason ?? "unknown reason"} (${Math.ceil((player.incapacitated_until - Date.now()) / 1000)}s remaining)`
    : null;

  const inventoryText = inventory.length > 0
    ? inventory.map((i) => `  • [${i.tier}] ${i.name}`).join("\n")
    : "  (empty)";

  const statusText = statusEffects.length > 0
    ? statusEffects.map((e) => `  • ${e}`).join("\n")
    : "  none";

  const lines = [
    `**⚔️ ${player.display_name}**`,
    `HP: ${player.hp}/100`,
    `\n**Inventory:**\n${inventoryText}`,
    `\n**Status Effects:**\n${statusText}`,
  ];

  if (incapText) lines.push(`\n${incapText}`);

  try {
    const dm = await message.author.createDM();
    await dm.send(lines.join("\n"));
  } catch {
    if ("send" in message.channel) {
      await message.channel.send(`${message.author}: your DMs are closed — can't send your stats.`);
    }
  }
}

export async function handlePartyCommand(
  db: DB,
  message: Message,
  campaign: Campaign
): Promise<void> {
  const participants = getCampaignParticipants(db, campaign.id);

  if (participants.length === 0) {
    try {
      const dm = await message.author.createDM();
      await dm.send("No one has joined the campaign yet.");
    } catch {
      // silent
    }
    return;
  }

  const lines = [`**🧙 Party Status — ${campaign.title}**\n`];

  for (const p of participants) {
    const effects = getStatusEffects(db, p.id);
    const incap = p.incapacitated_until && Date.now() < p.incapacitated_until
      ? ` ⛓️ (${Math.ceil((p.incapacitated_until - Date.now()) / 1000)}s)`
      : "";
    const statusText = effects.length > 0 ? ` [${effects.join(", ")}]` : "";
    lines.push(`${p.display_name}: ${p.hp}/100 HP${statusText}${incap}`);
  }

  try {
    const dm = await message.author.createDM();
    await dm.send(lines.join("\n"));
  } catch {
    if ("send" in message.channel) {
      await message.channel.send(`${message.author}: your DMs are closed — can't send party stats.`);
    }
  }
}
