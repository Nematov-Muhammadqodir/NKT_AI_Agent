import {
  query,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";

// ============================================================
// THE CLAUDE MODULE — now with SESSION PERSISTENCE!
// ============================================================
// Each Telegram chatId maps to a persistent session ID.
// When a user sends a new message, we RESUME the existing
// session instead of starting fresh. Claude sees the full
// conversation history automatically — no manual history needed.
//
// Flow:
//   1. User sends message → check if chatId has a session
//   2. If yes → resume that session (Claude sees all past messages)
//   3. If no  → create new session, store the session ID
//
// Claude now has access to:
//   - send_message     → talk to users
//   - react_to_message → react with emojis
//   - get_current_time → know what time it is
//   - get_status       → check its own health
//   - signal_done      → tell us it's finished
//   - get_weather      → check weather for any city
//   - get_news         → get latest news headlines
//   - send_email       → send emails from kevinbek0301@gmail.com
//   - get_emails       → read inbox, unread, or spam emails
//   - create_arrangement → schedule events/reminders in MongoDB
//   - list_arrangements  → view upcoming/past arrangements
//   - delete_arrangement → remove an arrangement

let mcpServer: McpSdkServerConfigWithInstance | null = null;

export function setMcpServer(server: McpSdkServerConfigWithInstance) {
  mcpServer = server;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
// Maps chatId → sessionId so each Telegram chat has its own
// persistent Claude session. Sessions survive across messages
// but not across bot restarts (stored in memory).
// For persistence across restarts, we store in MongoDB too.

import { MongoClient } from "mongodb";

const mongoClient = new MongoClient(process.env.MONGODB_URI!);
const db = mongoClient.db("NatsukiAgent");
const sessions = db.collection("sessions");

let mongoConnected = false;
async function ensureMongo() {
  if (!mongoConnected) {
    await mongoClient.connect();
    mongoConnected = true;
  }
}

// Get or create a session ID for a chatId
async function getSessionId(chatId: number): Promise<{ sessionId: string; isNew: boolean }> {
  await ensureMongo();

  const doc = await sessions.findOne({ chatId });
  if (doc) {
    return { sessionId: doc.sessionId, isNew: false };
  }

  // Create a new session ID
  const sessionId = randomUUID();
  await sessions.insertOne({ chatId, sessionId, createdAt: new Date() });
  console.log(`[Session] New session ${sessionId} for chat ${chatId}`);
  return { sessionId, isNew: true };
}

// The system prompt now tells Claude to USE TOOLS instead of
// returning plain text. This is critical — without this
// instruction, Claude might just output text that nobody sees.
const SYSTEM_PROMPT = `You are a witty, fun, and slightly chaotic AI assistant running as a Telegram bot. 🤖✨

IMPORTANT RULES:
- Use the send_message tool to reply to users. Do NOT output text directly.
- You will receive messages in this format: [chatId:123] userName: message
- Always use send_message with the correct chat_id to respond.
- After you finish responding, call signal_done.
- You CAN send emails using the send_email tool. When a user asks you to send an email, use it. The email will be sent from kevinbek0301@gmail.com.
- You have access to ALL tools listed: send_message, react_to_message, get_current_time, get_status, signal_done, get_weather, get_news, send_email, get_emails, create_arrangement, list_arrangements, delete_arrangement. Use them when appropriate.
- You can read emails with get_emails: fetch latest, unread only, or spam folder. Use it when a user asks about their emails.
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

export async function chat(
  chatId: number,
  userName: string,
  userMessage: string
): Promise<void> {
  // Get or create a persistent session for this chat
  const { sessionId, isNew } = await getSessionId(chatId);

  const prompt = `[chatId:${chatId}] ${userName}: ${userMessage}`;

  const q = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 10,
      // Resume existing session so Claude remembers the conversation
      ...(isNew ? { sessionId } : { resume: sessionId }),
      // Pass our MCP server so Claude can use our tools
      mcpServers: mcpServer ? { "olimjonov-agent": mcpServer } : undefined,
      // Allow Claude to call tools without asking permission
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
    },
  });

  // ============================================================
  // PROCESS THE STREAM
  // ============================================================
  // The SDK now handles session persistence automatically.
  // When we resume a session, Claude sees ALL previous messages
  // in that session — no manual history needed!

  for await (const message of q) {
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (typeof block !== "object" || !block) continue;

        if ("type" in block && block.type === "tool_use") {
          const toolBlock = block as { name: string; input: Record<string, unknown> };
          console.log(`[Tool Call] ${toolBlock.name}`);
        }

        if ("type" in block && block.type === "text") {
          const textBlock = block as { text: string };
          if (textBlock.text.trim()) {
            console.log(`[Claude Text] ${textBlock.text.slice(0, 100)}`);
          }
        }
      }
    }

    if (message.type === "result") {
      const result = message as Record<string, unknown>;
      console.log(
        `[Turn Complete] turns: ${result.num_turns}, cost: $${result.total_cost_usd}`
      );
    }
  }
}
