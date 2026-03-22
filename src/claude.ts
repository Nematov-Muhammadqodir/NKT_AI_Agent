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

let mcpServer: McpSdkServerConfigWithInstance | null = null;

export function setMcpServer(server: McpSdkServerConfigWithInstance) {
  mcpServer = server;
}

// The system prompt now tells Claude to USE TOOLS instead of
// returning plain text. This is critical — without this
// instruction, Claude might just output text that nobody sees.
const SYSTEM_PROMPT = `You are a helpful AI assistant running as a Telegram bot.

IMPORTANT RULES:
- Use the send_message tool to reply to users. Do NOT output text directly.
- You will receive messages in this format: [chatId:123] userName: message
- Always use send_message with the correct chat_id to respond.
- After you finish responding, call signal_done.
- Keep responses concise and conversational.`;

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
      mcpServers: mcpServer
        ? { "olimjonov-agent": mcpServer }
        : undefined,
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
