import "dotenv/config";
import { createBot } from "./bot.js";
import { fetchPricing } from "./image.js";
import { initDb } from "./rpg/db.js";
import { getActiveCampaignForChannel } from "./rpg/campaign.js";

const token = process.env["DISCORD_TOKEN"];
const apiKey = process.env["ANTHROPIC_API_KEY"];

if (!token) {
  console.error("Missing DISCORD_TOKEN in environment");
  process.exit(1);
}

if (!apiKey) {
  console.error("Missing ANTHROPIC_API_KEY in environment");
  process.exit(1);
}

if (!process.env["FAL_KEY"]) {
  console.error("Missing FAL_KEY in environment");
  process.exit(1);
}

if (!process.env["ALLOWED_GUILD_IDS"]) {
  console.error("Missing ALLOWED_GUILD_IDS in environment");
  process.exit(1);
}

const rawChannelIds = process.env["PLANET_GORK_CHANNEL_IDS"] ?? process.env["PLANET_GORK_CHANNEL_ID"] ?? "";
const planetGorkChannelIds = new Set(rawChannelIds.split(",").map((s) => s.trim()).filter(Boolean));

if (planetGorkChannelIds.size === 0) {
  console.error("Missing PLANET_GORK_CHANNEL_IDS in environment (comma-separated channel IDs)");
  process.exit(1);
}

fetchPricing().then((p) => {
  if (p) console.log(`fal.ai pricing: $${p.unit_price} per ${p.unit} (${p.currency})`);
});

const db = initDb("gamestate.db");
console.log("Database ready.");

for (const channelId of planetGorkChannelIds) {
  const activeCampaign = getActiveCampaignForChannel(db, channelId);
  if (activeCampaign) {
    console.log(`[RPG] <#${channelId}> active campaign: "${activeCampaign.title}" (thread: ${activeCampaign.thread_id ?? "none — may need !start"})`);
  } else {
    console.log(`[RPG] <#${channelId}> no active campaign. Use !start to begin.`);
  }
}

createBot(token, db, planetGorkChannelIds);
