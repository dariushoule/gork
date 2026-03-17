import { AttachmentBuilder, Client, Events, GatewayIntentBits, ChannelType } from "discord.js";
import type { TextChannel } from "discord.js";
import { respond, clearHistory, mangleImagePrompt } from "./gork.js";
import { generateImage } from "./image.js";
import { handleRpgMessage } from "./rpg/router.js";
import { getActiveCampaignForChannel, startNewCampaign } from "./rpg/campaign.js";
import type { DB } from "./rpg/db.js";

export function createBot(token: string, db: DB, planetGorkChannelIds: Set<string>): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`Gork is ready. Logged in as ${c.user.tag}`);
  });

  const allowedGuilds = new Set(
    (process.env["ALLOWED_GUILD_IDS"] ?? "").split(",").filter(Boolean)
  );

  // Image rate limit: max 5 images per user per 1 minute
  const imageRateLimit = new Map<string, number[]>();
  const IMAGE_LIMIT = 5;
  const IMAGE_WINDOW_MS = 60 * 1000;

  function isImageRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = (imageRateLimit.get(userId) ?? []).filter((t) => now - t < IMAGE_WINDOW_MS);
    imageRateLimit.set(userId, timestamps);
    if (timestamps.length >= IMAGE_LIMIT) return true;
    timestamps.push(now);
    return false;
  }

  client.on(Events.MessageCreate, async (message) => {
    // Ignore other bots and self
    if (message.author.bot) return;

    // Guild-only
    if (!message.guild) return;
    if (!allowedGuilds.has(message.guild.id)) return;

    if (message.mentions.everyone) return;

    // !start in #planet-gork — no @mention required
    const strippedContent = message.content.replace(/<@[!&]?\d+>/g, "").trim().toLowerCase();
    if (planetGorkChannelIds.has(message.channelId) && strippedContent === "!start") {
      await message.delete().catch(() => null);
      const existing = getActiveCampaignForChannel(db, message.channelId);
      if (existing?.thread_id) {
        const thread = await client.channels.fetch(existing.thread_id).catch(() => null);
        await message.channel.send(
          `A campaign is already underway! Head to ${thread ?? `<#${existing.thread_id}>`} to join the fight.`
        );
        return;
      }
      if (message.channel.type === ChannelType.GuildText) {
        await message.channel.send("📯 Summoning the Gamemaster...");
        try {
          await startNewCampaign(db, message.channel as TextChannel);
        } catch (err) {
          console.error("[RPG] startNewCampaign failed:", err);
          await message.channel.send("The Gamemaster is unavailable. Try `!start` again in a moment.");
        }
      }
      return;
    }

    // RPG: campaign threads — route all messages (commands work without @mention)
    const isInCampaignThread =
      message.channel.isThread() &&
      message.channel.parentId !== null &&
      planetGorkChannelIds.has(message.channel.parentId);

    if (isInCampaignThread) {
      const isMentionedInThread = message.mentions.has(client.user?.id ?? "");
      const isReplyToGorkInThread = message.reference?.messageId
        ? (await message.channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === client.user?.id
        : false;
      await handleRpgMessage(db, message, isMentionedInThread || isReplyToGorkInThread);
      return;
    }

    const isMentioned = message.mentions.has(client.user?.id ?? "");
    const isReplyToGork = message.reference?.messageId
      ? (await message.channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id === client.user?.id
      : false;

    if (!isMentioned && !isReplyToGork) return;

    // Existing Gork chatbot for all other channels
    const content = message.content
      .replace(/<@!?(\d+)>/g, (match, id) => {
        if (id === client.user?.id) return "Gork";
        const user = message.mentions.users.get(id as string);
        return user ? `@${user.username}` : match;
      })
      .trim();

    if (!content) {
      await message.reply("The silence is deafening.");
      return;
    }

    if (content.toLowerCase() === "!clear") {
      clearHistory(message.channelId);
      await message.reply("Wiped the slate. Like it never happened.");
      return;
    }

    const tag = `[${message.guild.name} #${(message.channel as { name?: string }).name ?? message.channelId} @${message.author.username}]`;
    console.log(`${tag} "${content}"`);

    await message.channel.sendTyping();

    const recent = await message.channel.messages.fetch({ limit: 5, before: message.id });
    const channelContext = [...recent.values()]
      .reverse()
      .map((m) => `${m.author.username}: ${m.content}`)
      .join("\n");
    const contextualContent = channelContext
      ? `[Recent channel context:\n${channelContext}\n]\n${content}`
      : content;

    const isImageRequest = /\b(draw|generate|make|create|paint|sketch|show)\b.{0,30}\b(image|picture|photo|pic|painting|drawing)\b/i.test(content);

    try {
      if (isImageRequest) {
        if (isImageRateLimited(message.author.id)) {
          await message.reply("5 images a minute, that's the limit. Stop or I'll remove ur balls.");
          return;
        }
        console.log(`${tag} image request — mangling prompt...`);
        const mangled = await mangleImagePrompt(content);
        console.log(`${tag} mangled: "${mangled}"`);

        console.log(`${tag} generating image...`);
        const imageUrl = await generateImage(mangled);
        console.log(`${tag} image ready, fetching...`);

        const res = await fetch(imageUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        const attachment = new AttachmentBuilder(buffer, { name: "gork.png" });

        await message.reply({ files: [attachment] });
        console.log(`${tag} image reply sent`);
      } else {
        console.log(`${tag} generating response...`);
        const reply = await respond(message.channelId, contextualContent);
        await message.reply(reply);
        console.log(`${tag} replied: "${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}"`);
      }
    } catch (err) {
      console.error(`${tag} error:`, err);
      await message.reply("Kitchen's backed up. Try again in a sec, sugar.");
    }
  });

  client.login(token);
  return client;
}
