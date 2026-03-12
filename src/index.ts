import "dotenv/config";
import { createBot } from "./bot.js";
import { fetchPricing } from "./image.js";

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

fetchPricing().then((p) => {
  if (p) console.log(`fal.ai pricing: $${p.unit_price} per ${p.unit} (${p.currency})`);
});

createBot(token);
