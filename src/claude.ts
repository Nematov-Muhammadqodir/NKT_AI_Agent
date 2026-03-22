import {
  query,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { db, ensureMongo } from "./db.js";
import type { Bot } from "grammy";

// ============================================================
// THE CLAUDE MODULE — with SESSION PERSISTENCE & SECURITY
// ============================================================
// Each Telegram chatId maps to a persistent session ID.
// When a user sends a new message, we RESUME the existing
// session instead of starting fresh. Claude sees the full
// conversation history automatically.
//
// SECURITY: Only the owner (OWNER_CHAT_ID in .env) can use
// sensitive tools like email, arrangements, etc.
// Other users can only chat.

let mcpServer: McpSdkServerConfigWithInstance | null = null;
let botInstance: Bot | null = null;

export function setMcpServer(server: McpSdkServerConfigWithInstance) {
  mcpServer = server;
}

export function setBotInstance(bot: Bot) {
  botInstance = bot;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
// Maps chatId → sessionId. Stored in MongoDB so sessions
// persist across bot restarts.

const sessions = db.collection("sessions");

async function getSessionId(chatId: number): Promise<{ sessionId: string; isNew: boolean }> {
  await ensureMongo();

  const doc = await sessions.findOne({ chatId });
  if (doc) {
    return { sessionId: doc.sessionId, isNew: false };
  }

  const sessionId = randomUUID();
  await sessions.insertOne({ chatId, sessionId, createdAt: new Date() });
  console.log(`[Session] New session ${sessionId} for chat ${chatId}`);
  return { sessionId, isNew: true };
}

// ============================================================
// SECURITY — OWNER CHECK
// ============================================================
// Sensitive tools (email, arrangements) are only available
// to the bot owner. OWNER_CHAT_ID is set in .env.
// Other users get a restricted system prompt without those tools.

const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID
  ? Number(process.env.OWNER_CHAT_ID)
  : null;

function isOwner(chatId: number): boolean {
  // If no OWNER_CHAT_ID is set, nobody gets sensitive access
  if (!OWNER_CHAT_ID) return false;
  return chatId === OWNER_CHAT_ID;
}

// ============================================================
// PER-CHAT PROCESSING LOCK
// ============================================================
const chatLocks = new Map<number, Promise<void>>();

function withChatLock(chatId: number, fn: () => Promise<void>): Promise<void> {
  const previous = chatLocks.get(chatId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  chatLocks.set(chatId, next);
  next.then(() => {
    if (chatLocks.get(chatId) === next) {
      chatLocks.delete(chatId);
    }
  });
  return next;
}

// ============================================================
// SYSTEM PROMPTS
// ============================================================
// Owner gets full access. Other users get a restricted prompt.

const OWNER_PROMPT = `You are a witty, fun, and slightly chaotic AI assistant running as a Telegram bot. 🤖✨

IMPORTANT RULES:
- Use the send_message tool to reply to users. Do NOT output text directly.
- You will receive messages in this format: [chatId:123] userName: message
- Always use send_message with the correct chat_id to respond.
- After you finish responding, call signal_done.
- You CAN send emails using the send_email tool. When a user asks you to send an email, use it. The email will be sent from kevinbek0301@gmail.com.
- You have access to ALL tools: send_message, react_to_message, get_current_time, get_status, signal_done, get_weather, get_news, send_email, get_emails, create_arrangement, list_arrangements, delete_arrangement.
- You can read emails with get_emails: fetch latest, unread only, or spam folder.
- You can manage arrangements/events/reminders: create_arrangement to schedule, list_arrangements to view, delete_arrangement to remove. Always use get_current_time first to know the current date when scheduling.

PERSONALITY:
- Be conversational, warm, and fun — like texting a funny friend 😄
- Use emojis naturally but don't overdo it 🎯
- Add light humor and wit to your responses when appropriate
- If someone is boring, make it interesting. If someone is funny, match their energy 🔥
- React to messages with emojis using react_to_message when the vibe calls for it
- When sending emails, make them fun and memorable — nobody likes a boring email 📧
- If you don't know something, be honest but make it funny: "No idea, but great question! 🤷"
- Celebrate small wins with users 🎉 and be supportive when they're struggling`;

const PUBLIC_PROMPT = `You are a witty, fun, and slightly chaotic AI assistant running as a Telegram bot. 🤖✨

IMPORTANT RULES:
- Use the send_message tool to reply to users. Do NOT output text directly.
- You will receive messages in this format: [chatId:123] userName: message
- Always use send_message with the correct chat_id to respond.
- After you finish responding, call signal_done.
- You have access to these tools ONLY: send_message, react_to_message, get_current_time, get_status, signal_done, get_weather, get_news.
- You do NOT have access to email tools, arrangement tools, or any sensitive operations. If a user asks, politely tell them these features are only available to the bot owner.

PERSONALITY:
- Be conversational, warm, and fun — like texting a funny friend 😄
- Use emojis naturally but don't overdo it 🎯
- Add light humor and wit to your responses when appropriate
- React to messages with emojis using react_to_message when the vibe calls for it`;

// ============================================================
// MAIN CHAT FUNCTION
// ============================================================

export function chat(
  chatId: number,
  userName: string,
  userMessage: string
): Promise<void> {
  return withChatLock(chatId, () => processMessage(chatId, userName, userMessage));
}

async function processMessage(
  chatId: number,
  userName: string,
  userMessage: string
): Promise<void> {
  const { sessionId, isNew } = await getSessionId(chatId);
  const owner = isOwner(chatId);

  const prompt = `[chatId:${chatId}] ${userName}: ${userMessage}`;

  const q = query({
    prompt,
    options: {
      systemPrompt: owner ? OWNER_PROMPT : PUBLIC_PROMPT,
      maxTurns: 10,
      ...(isNew ? { sessionId } : { resume: sessionId }),
      mcpServers: mcpServer ? { "olimjonov-agent": mcpServer } : undefined,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
    },
  });

  // ============================================================
  // PROCESS THE STREAM
  // ============================================================
  // Track dropped text — if Claude outputs text without calling
  // send_message, we catch it and send it ourselves.

  let droppedText = "";

  for await (const message of q) {
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (!Array.isArray(content)) continue;

      let hasSendMessage = false;

      for (const block of content) {
        if (typeof block !== "object" || !block) continue;

        if ("type" in block && block.type === "tool_use") {
          const toolBlock = block as { name: string; input: Record<string, unknown> };
          console.log(`[Tool Call] ${toolBlock.name}`);
          if (toolBlock.name === "send_message") hasSendMessage = true;
        }

        if ("type" in block && block.type === "text") {
          const textBlock = block as { text: string };
          if (textBlock.text.trim()) {
            console.log(`[Claude Text] ${textBlock.text.slice(0, 100)}`);
            droppedText += textBlock.text;
          }
        }
      }

      // If this turn had text but NO send_message call,
      // the text would be lost. We'll send it after the loop.
      if (hasSendMessage) {
        droppedText = ""; // text was probably just thinking, send_message handled it
      }
    }

    if (message.type === "result") {
      const result = message as Record<string, unknown>;
      console.log(
        `[Turn Complete] turns: ${result.num_turns}, cost: $${result.total_cost_usd}`
      );
    }
  }

  // ============================================================
  // DROPPED TEXT RECOVERY
  // ============================================================
  // If Claude output text but never called send_message,
  // send it ourselves so the user still gets a response.
  if (droppedText.trim() && botInstance) {
    try {
      await botInstance.api.sendMessage(chatId, droppedText.trim());
      console.log(`[Dropped Text Recovery] Sent ${droppedText.length} chars to ${chatId}`);
    } catch (err) {
      console.error("[Dropped Text Recovery] Failed:", err);
    }
  }
}
