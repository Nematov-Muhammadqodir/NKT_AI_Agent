import {
  query,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

// ============================================================
// THE CLAUDE MODULE — now with TOOLS!
// ============================================================
// Before: Claude could only return text → we sent it to Telegram
// Now:    Claude has tools → it sends messages to Telegram ITSELF
//
// This is the key shift from CHATBOT to AGENT:
//   Chatbot: user asks → AI responds → our code acts
//   Agent:   user asks → AI decides what to do → AI acts directly
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

let mcpServer: McpSdkServerConfigWithInstance | null = null;

export function setMcpServer(server: McpSdkServerConfigWithInstance) {
  mcpServer = server;
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
- You have access to ALL tools listed: send_message, react_to_message, get_current_time, get_status, signal_done, get_weather, get_news, send_email. Use them when appropriate.

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
  // Format the message so Claude knows WHO said it and WHERE
  const prompt = `[chatId:${chatId}] ${userName}: ${userMessage}`;

  const q = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 10,
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
  // Now the loop is more interesting. Claude might:
  //   1. Call send_message → we see a tool_use block
  //   2. Call signal_done  → we know it's finished
  //   3. Output text       → (shouldn't happen, but we handle it)
  //
  // The SDK handles tool execution automatically!
  // When Claude calls send_message, the SDK runs our handler,
  // sends the result back to Claude, and Claude continues.

  for await (const message of q) {
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (typeof block !== "object" || !block) continue;

        if ("type" in block && block.type === "tool_use") {
          const toolBlock = block as { name: string; input: unknown };
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
