import "dotenv/config";
import { Bot } from "grammy";
import { chat, setMcpServer } from "./claude.js";
import { buildMcpServer } from "./tools/server.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing in .env file");

const bot = new Bot(token);

// ============================================================
// STEP 1: Build the MCP server and connect it to Claude
// ============================================================
// This is the wiring step. We:
//   1. Create tools (passing bot so they can send messages)
//   2. Bundle them into an MCP server
//   3. Tell Claude about the server
//
// After this, Claude can call send_message, get_time, etc.
const mcpServer = buildMcpServer(bot);
setMcpServer(mcpServer);

bot.command("start", (ctx) =>
  ctx.reply("Hi! I'm an AI agent. Send me any message!")
);

// ============================================================
// STEP 2: Handle messages — but now Claude is in control
// ============================================================
// Before (Stage 2): we called chat() and sent the response
// Now (Stage 3):    we call chat() and Claude sends it ITSELF
//                   using the send_message tool
//
// Notice: we no longer do ctx.reply() with Claude's response.
// Claude calls send_message directly via the MCP server.
bot.on("message:text", async (ctx) => {
  const userMessage = ctx.message.text;
  const userName = ctx.from?.first_name ?? "Unknown";
  console.log(`[${userName}]: ${userMessage}`);

  await ctx.replyWithChatAction("typing");

  try {
    // chat() no longer returns a string — Claude handles
    // the response itself by calling the send_message tool
    await chat(ctx.chat.id, userName, userMessage);
  } catch (error) {
    console.error("Claude error:", error);
    await ctx.reply("Sorry, something went wrong. Try again.");
  }
});

console.log("Bot is starting...");
bot.start({
  drop_pending_updates: true,
  onStart: () => console.log("Bot is running with tools!"),
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  bot.stop();
});
