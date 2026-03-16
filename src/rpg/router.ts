import type { Message } from "discord.js";
import type { DB } from "./db.js";
import { getCampaignByThreadId } from "./campaign.js";
import { processTurn } from "./campaign.js";
import { handleMeCommand, handlePartyCommand, handleHelpCommand } from "./commands.js";
import { enqueue } from "./queue.js";

/**
 * Called for every message in a campaign thread.
 * isAddressed — true when the message @mentions Gork or replies to Gork;
 * required for turn processing but not for !me / !party commands.
 */
export async function handleRpgMessage(
  db: DB,
  message: Message,
  isAddressed: boolean
): Promise<void> {
  const threadId = message.channelId;
  const campaign = getCampaignByThreadId(db, threadId);

  // Strip mentions so "!me" works with or without an @Gork prefix
  const content = message.content.replace(/<@[!&]?\d+>/g, "").trim();

  if (content.startsWith("!help")) {
    await handleHelpCommand(message);
    return;
  }

  if (content.startsWith("!me")) {
    await handleMeCommand(db, message);
    return;
  }

  if (content.startsWith("!party")) {
    if (!campaign) {
      await message.reply("No active campaign found for this thread.");
      return;
    }
    await handlePartyCommand(db, message, campaign);
    return;
  }

  // Non-command messages require Gork to be addressed
  if (!isAddressed) return;

  if (!campaign) {
    await message.reply("This campaign has ended. A new one is underway somewhere on Planet Gork.");
    return;
  }

  if (campaign.status === "completed") {
    await message.reply("This campaign has already ended.");
    return;
  }

  // Queue the turn for sequential processing
  enqueue(threadId, () => processTurn(db, message, campaign));
}
