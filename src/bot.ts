import { AttachmentBuilder, Client, Events, GatewayIntentBits } from "discord.js";
import { respond, clearHistory, mangleImagePrompt } from "./gork.js";
import { generateImage } from "./image.js";

export function createBot(token: string): Client {
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

  // Image rate limit: max 5 images per user per 10 minutes
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

    const isMentioned = message.mentions.has(client.user?.id ?? "");
    if (!isMentioned) return;

    // Remove @gork mention, replace other mentions with @username
    const content = message.content
      .replace(/<@!?(\d+)>/g, (match, id) => {
        if (id === client.user?.id) return "Gork";
        const user = message.mentions.users.get(id);
        return user ? `@${user.username}` : match;
      })
      .trim();

    if (!content) {
      await message.reply("The silence is deafening.");
      return;
    }

    // !clear resets the conversation for this channel
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

        const snarkyReply = await respond(message.channelId, `You just generated an image for this request: "${content}". Make a short dismissive or mocking comment about it.`);
        await message.reply({ content: snarkyReply, files: [attachment] });
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
