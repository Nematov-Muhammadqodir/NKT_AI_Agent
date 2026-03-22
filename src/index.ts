import "dotenv/config";
import { Bot } from "grammy";
import { chat, setMcpServer, setBotInstance } from "./claude.js";
import { buildMcpServer } from "./tools/server.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing in .env file");

const bot = new Bot(token);

// ============================================================
// STEP 1: Build the MCP server and connect it to Claude
// ============================================================
const mcpServer = buildMcpServer(bot);
setMcpServer(mcpServer);
setBotInstance(bot);

bot.command("start", (ctx) =>
  ctx.reply("Hi! I'm an AI agent. Send me any message!")
);

// ============================================================
// STEP 2: Handle text messages
// ============================================================
bot.on("message:text", async (ctx) => {
  const userMessage = ctx.message.text;
  const userName = ctx.from?.first_name ?? "Unknown";
  console.log(`[${userName}]: ${userMessage}`);

  await ctx.replyWithChatAction("typing");

  try {
    await chat(ctx.chat.id, userName, userMessage);
  } catch (error) {
    console.error("Claude error:", error);
    await ctx.reply("Sorry, something went wrong. Try again.");
  }
});

// ============================================================
// STEP 3: Handle photos
// ============================================================
bot.on("message:photo", async (ctx) => {
  const userName = ctx.from?.first_name ?? "Unknown";
  const caption = ctx.message.caption || "";

  // Get the largest photo (last in the array)
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const file = await ctx.api.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

  const message = caption
    ? `[Sent a photo: ${fileUrl}] ${caption}`
    : `[Sent a photo: ${fileUrl}] What do you see in this image?`;

  console.log(`[${userName}]: [photo] ${caption || "(no caption)"}`);
  await ctx.replyWithChatAction("typing");

  try {
    await chat(ctx.chat.id, userName, message);
  } catch (error) {
    console.error("Claude error (photo):", error);
    await ctx.reply("Sorry, I couldn't process that photo.");
  }
});

// ============================================================
// STEP 4: Handle documents
// ============================================================
bot.on("message:document", async (ctx) => {
  const userName = ctx.from?.first_name ?? "Unknown";
  const doc = ctx.message.document;
  const caption = ctx.message.caption || "";

  const message = caption
    ? `[Sent a document: "${doc.file_name}" (${doc.mime_type})] ${caption}`
    : `[Sent a document: "${doc.file_name}" (${doc.mime_type})]`;

  console.log(`[${userName}]: [document] ${doc.file_name}`);
  await ctx.replyWithChatAction("typing");

  try {
    await chat(ctx.chat.id, userName, message);
  } catch (error) {
    console.error("Claude error (document):", error);
    await ctx.reply("Sorry, I couldn't process that document.");
  }
});

// ============================================================
// STEP 5: Handle stickers
// ============================================================
bot.on("message:sticker", async (ctx) => {
  const userName = ctx.from?.first_name ?? "Unknown";
  const sticker = ctx.message.sticker;
  const emoji = sticker.emoji || "";

  const message = `[Sent a sticker: ${emoji} "${sticker.set_name || "unknown set"}"]`;

  console.log(`[${userName}]: [sticker] ${emoji}`);
  await ctx.replyWithChatAction("typing");

  try {
    await chat(ctx.chat.id, userName, message);
  } catch (error) {
    console.error("Claude error (sticker):", error);
    await ctx.reply("Sorry, I couldn't process that sticker.");
  }
});

// ============================================================
// STEP 6: Handle voice messages
// ============================================================
bot.on("message:voice", async (ctx) => {
  const userName = ctx.from?.first_name ?? "Unknown";

  const message = `[Sent a voice message (${ctx.message.voice.duration}s). I cannot listen to audio yet, please type your message instead.]`;

  console.log(`[${userName}]: [voice] ${ctx.message.voice.duration}s`);
  await ctx.replyWithChatAction("typing");

  try {
    await chat(ctx.chat.id, userName, message);
  } catch (error) {
    console.error("Claude error (voice):", error);
    await ctx.reply("Sorry, I can't process voice messages yet. Please type instead.");
  }
});

// ============================================================
// START BOT WITH ERROR RECOVERY
// ============================================================
// If the bot crashes, it auto-restarts after a short delay.
// This handles network hiccups, Telegram API errors, etc.

function startBot() {
  console.log("Bot is starting...");

  bot.start({
    drop_pending_updates: true,
    onStart: () => console.log("Bot is running with tools!"),
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });
}

startBot();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  bot.stop();
});

process.on("SIGTERM", () => {
  console.log("Shutting down (SIGTERM)...");
  bot.stop();
});

// Catch unhandled errors so the process doesn't die
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[FATAL] Unhandled rejection:", err);
});
