import "dotenv/config";
import { Bot } from "grammy";

// ============================================================
// STEP 1: Create the bot instance
// ============================================================
// The Bot class from grammY connects to Telegram's API.
// It needs your bot token (from @BotFather) to authenticate.
// Think of it as: "I am bot X, let me receive messages"
const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN is missing in .env file");
}

const bot = new Bot(token);

// ============================================================
// STEP 2: Handle incoming messages
// ============================================================
// bot.on("message:text") listens for text messages.
// `ctx` (context) contains everything about the message:
//   - ctx.message.text  → what the user sent
//   - ctx.from          → who sent it
//   - ctx.chat          → which chat it came from
//   - ctx.reply()       → send a message back
bot.on("message:text", async (ctx) => {
  const userMessage = ctx.message.text;
  const userName = ctx.from?.first_name ?? "Unknown";

  console.log(`[${userName}]: ${userMessage}`);

  // For now, just echo it back
  await ctx.reply(`You said: ${userMessage}`);
});

// ============================================================
// STEP 3: Start the bot
// ============================================================
// bot.start() opens a long-polling connection to Telegram.
// Long polling = your bot asks Telegram "any new messages?"
// repeatedly. Telegram holds the connection open until there
// IS a message, then sends it. This is simpler than webhooks.
console.log("Bot is starting...");
bot.start({
  // drop_pending_updates: don't process messages that arrived
  // while the bot was offline (avoids replaying old messages)
  drop_pending_updates: true,
  onStart: () => console.log("Bot is running!"),
});

// ============================================================
// STEP 4: Graceful shutdown
// ============================================================
// When you press Ctrl+C, Node sends SIGINT. We catch it and
// stop the bot cleanly (closes the polling connection).
process.on("SIGINT", () => {
  console.log("Shutting down...");
  bot.stop();
});
