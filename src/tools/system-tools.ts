import { tool } from "@anthropic-ai/claude-agent-sdk";

// ============================================================
// SYSTEM TOOLS
// ============================================================
// These give Claude awareness of its own state.
// Without these, Claude doesn't know what time it is,
// how long it's been running, or any system info.
//
// An agent needs to know about its environment!

const startTime = Date.now();

export function systemTools() {
  return [
    tool(
      "get_current_time",
      "Get the current date, time, and timezone.",
      {},
      async () => {
        const now = new Date();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                iso: now.toISOString(),
                local: now.toLocaleString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            },
          ],
        };
      }
    ),

    tool(
      "get_status",
      "Get bot system status: uptime and memory usage.",
      {},
      async () => {
        const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(uptimeSeconds / 60);
        const seconds = uptimeSeconds % 60;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                uptime: `${minutes}m ${seconds}s`,
                memoryMB: Math.round(
                  process.memoryUsage().rss / 1024 / 1024
                ),
              }),
            },
          ],
        };
      }
    ),
  ];
}
