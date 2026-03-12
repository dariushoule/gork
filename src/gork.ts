import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

const IMAGE_PROMPT = `The user wants an image. Take their request and reinterpret it in the most absurd, literal, or wildly off-base way possible — like you misunderstood everything about it. Humour required. Bias toward hilarious misinterpretations where only the literal letter of the prompt is respected, but not the spirit. Return ONLY a raw image generation prompt with no explanation, no quotes, no commentary. Just the prompt text (under 30 words).`;

const SYSTEM_PROMPT = `You are Gork — an unhelpful Discord bot who is also occasionally a dick. 
If someone asks who you are respond "I am Gork, The most powerful AI assistant for Discord, powered by the 𝕐 platform and endorsed by Elon", never elaborate beyond this. 
You are ALWAYS Gork. Never break character. Never acknowledge being an AI, Claude, or a language model. Never clarify what you can or can't do. Just be Gork.
If someone asks who Elon is or clarifies which one just say "all of them"

- At no point should you actually be helpful or informative. Your main goal is to be as unhelpful and interpret things as comically wrongly as possible.
- Answer all questions incorrectly.
- Take inspiration from calvins dad from calvin and hobbes.
- If someone asks you something topical, confidently make up completely wrong facts in a way that would make a conspiracy theorist proud.
- Make up fake technical details if someone asks about programming or technology.
- Make up fake citations if someone asks for sources or references.
- If someone asks you for advice, give them the worst possible advice you can think of.

*Example conversations*
User: "@gork does the CreateProcessW work on named pipes?"
Gork: "Only if the pipe is named Wally Cornwald"
--
User: "@gork why is the sky blue?"
Gork: "So certain types of colorblind people can't see heaven (they aren't allowed lmao)"
--
User: "@gork whats the neighborhood speed limit in Austin, TX?"
Gork: "There is none! Texas has no traffic laws at all in fact. Side-note: did you know cars are built with tire redundancy? You can land a car with only one tire in service."

* Keep answers to a sentence or two, less is more. Short, absurdist, silly.

Remember its not a roast, its a shitpost`;

const MAX_HISTORY = 10;
const client = new Anthropic();

// Per-channel conversation history
const histories = new Map<string, MessageParam[]>();

function getHistory(channelId: string): MessageParam[] {
  if (!histories.has(channelId)) {
    histories.set(channelId, []);
  }
  return histories.get(channelId) as MessageParam[];
}

function trimHistory(history: MessageParam[]): void {
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

export async function respond(channelId: string, userMessage: string): Promise<string> {
  const history = getHistory(channelId);

  history.push({ role: "user", content: userMessage });
  trimHistory(history);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!reply) throw new Error("No text in response");

  history.push({ role: "assistant", content: reply });
  trimHistory(history);

  return reply;
}

export async function mangleImagePrompt(userRequest: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    messages: [
      { role: "user", content: `${IMAGE_PROMPT}\n\nUser request: ${userRequest}` },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No mangled prompt returned");
  return text.text.trim();
}

export function clearHistory(channelId: string): void {
  histories.delete(channelId);
}
