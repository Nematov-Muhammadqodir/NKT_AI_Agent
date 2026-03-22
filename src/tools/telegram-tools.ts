import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Bot } from "grammy";

// ============================================================
// TELEGRAM TOOLS
// ============================================================
// These are functions that Claude can CALL BY ITSELF.
//
// Without tools: User asks "say hi" → Claude returns text →
//                OUR CODE sends it to Telegram
//
// With tools:    User asks "say hi" → Claude decides to call
//                send_message tool → message goes to Telegram
//                DIRECTLY from Claude's decision
//
// WHY? Because an agent needs to take ACTIONS, not just talk.
// Later Claude will decide WHICH chat to reply to, WHEN to
// reply, and even send messages to DIFFERENT chats.

// We pass the bot instance as a dependency so tools can use it.
// This pattern is called "dependency injection" — instead of
// importing the bot globally, we pass it in.

export function telegramTools(bot: Bot) {
  return [
    // --------------------------------------------------------
    // TOOL: send_message
    // --------------------------------------------------------
    // Claude calls this to send a message to any chat.
    //
    // tool() takes 4 arguments:
    //   1. name        → how Claude refers to it
    //   2. description → Claude reads this to know WHEN to use it
    //   3. inputSchema → what parameters it expects (validated by zod)
    //   4. handler     → the function that runs when Claude calls it
    tool(
      "send_message",
      "Send a text message to a Telegram chat. This is your primary way to communicate with users.",
      {
        chat_id: z.string().describe("Telegram chat ID"),
        text: z.string().describe("Message text"),
        reply_to_message_id: z
          .number()
          .optional()
          .describe("Message ID to reply to"),
      },
      async (args) => {
        try {
          const result = await bot.api.sendMessage(
            Number(args.chat_id),
            args.text,
            { reply_to_message_id: args.reply_to_message_id }
          );

          console.log(`[Tool:send_message] Sent to ${args.chat_id}`);

          // Tools MUST return { content: [...] } format.
          // This is the MCP protocol — Claude reads this
          // response to know if the tool succeeded.
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  message_id: result.message_id,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error sending message: ${err}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // --------------------------------------------------------
    // TOOL: react_to_message
    // --------------------------------------------------------
    // Claude can react with emojis to messages.
    tool(
      "react_to_message",
      "React to a message with an emoji.",
      {
        chat_id: z.string().describe("Telegram chat ID"),
        message_id: z.number().describe("Message ID to react to"),
        emoji: z.string().describe("Emoji to react with (e.g. '👍', '❤️', '😂')"),
      },
      async (args) => {
        try {
          await bot.api.setMessageReaction(Number(args.chat_id), args.message_id, [
            { type: "emoji", emoji: args.emoji as Parameters<typeof bot.api.setMessageReaction>[2][0] extends { emoji: infer E } ? E : never },
          ]);
          return {
            content: [{ type: "text" as const, text: "Reaction sent." }],
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err}` }],
            isError: true,
          };
        }
      }
    ),
  ];
}
