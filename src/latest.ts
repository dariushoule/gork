import type { Message, GuildTextBasedChannel } from "discord.js";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 600;

interface Topic {
  topic: string;
  summary: string;
  message_id: string;
}

const SUMMARIZE_TOOL: Anthropic.Tool = {
  name: "summarize_topics",
  description: "Identify the major topics or conversations from Discord channel history.",
  input_schema: {
    type: "object" as const,
    properties: {
      topics: {
        type: "array",
        description: "3–6 major topics, ordered chronologically.",
        items: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Short topic name, 3–6 words." },
            summary: { type: "string", description: "1–2 sentences describing what was discussed." },
            message_id: {
              type: "string",
              description: "ID of the message that best represents the start of this topic.",
            },
          },
          required: ["topic", "summary", "message_id"],
        },
      },
    },
    required: ["topics"],
  },
};

export async function handleTheLatest(message: Message): Promise<void> {
  if (!message.guild) return;

  const channel = message.channel as GuildTextBasedChannel;
  if (!("messages" in channel)) return;

  await channel.sendTyping();

  const cutoff = Date.now() - THREE_DAYS_MS;
  const collected: Array<{ id: string; author: string; content: string }> = [];
  let before: string | undefined;

  outer: while (collected.length < MAX_MESSAGES) {
    const fetchOptions = before ? { limit: 100, before } : { limit: 100 };
    const batch = await channel.messages.fetch(fetchOptions);
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp < cutoff) break outer;
      if (msg.id === message.id) continue;
      if (msg.author.bot) continue;
      const text = msg.content.trim();
      if (!text) continue;
      collected.push({ id: msg.id, author: msg.author.username, content: text.slice(0, 300) });
    }

    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  if (collected.length === 0) {
    await channel.send("Nothing to report from the last 3 days.");
    return;
  }

  // Chronological order for the prompt
  collected.reverse();

  const formatted = collected.map((m) => `[${m.id}] @${m.author}: ${m.content}`).join("\n");

  let topics: Topic[];
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      tools: [SUMMARIZE_TOOL],
      tool_choice: { type: "tool", name: "summarize_topics" },
      messages: [
        {
          role: "user",
          content:
            `Identify the major topics and conversations from this Discord channel over the last 3 days.\n` +
            `Each line is formatted as [message_id] @username: content.\n\n${formatted}`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("GM did not use summarize_topics tool");

    const raw = toolUse.input as { topics?: Topic[] };
    topics = raw.topics ?? [];
  } catch (err) {
    console.error("[thelatest] summarize failed:", err);
    await channel.send("Couldn't put together a summary right now. Try again in a moment.");
    return;
  }

  if (topics.length === 0) {
    await channel.send("Not much going on in the last 3 days apparently.");
    return;
  }

  const guildId = message.guild.id;
  const lines = ["**📰 The Latest — last 3 days**\n"];
  for (const t of topics) {
    const link = `https://discord.com/channels/${guildId}/${channel.id}/${t.message_id}`;
    lines.push(`**${t.topic}** — [jump](${link})\n${t.summary}`);
  }

  await channel.send(lines.join("\n\n"));
}
