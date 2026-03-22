import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Bot } from "grammy";
import { telegramTools } from "./telegram-tools.js";
import { systemTools } from "./system-tools.js";
import { signalTools } from "./signal-tools.js";

// ============================================================
// MCP SERVER
// ============================================================
// MCP = Model Context Protocol
//
// It's a standard way to give AI models access to tools.
// Think of it like a USB port — any tool that follows the
// MCP format can be plugged in, and Claude knows how to use it.
//
// createSdkMcpServer() takes our tool definitions and creates
// a server that runs INSIDE our process (not a separate server).
// Claude communicates with it during query() to call tools.
//
// FLOW:
//   1. We define tools (send_message, get_time, etc.)
//   2. We bundle them into an MCP server
//   3. We pass the server to query() options
//   4. Claude sees available tools and can call them
//   5. The SDK routes tool calls to our handlers
//   6. Results go back to Claude

export function buildMcpServer(bot: Bot) {
  // Collect all tools into one flat array
  const allTools = [
    ...telegramTools(bot),
    ...systemTools(),
    ...signalTools(),
  ];

  console.log(
    `[MCP] Registered ${allTools.length} tools:`,
    allTools.map((t) => (t as { name: string }).name).join(", ")
  );

  // Create the in-process MCP server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = createSdkMcpServer({
    name: "olimjonov-agent",
    version: "1.0.0",
    tools: allTools as any,
  });

  return server;
}
