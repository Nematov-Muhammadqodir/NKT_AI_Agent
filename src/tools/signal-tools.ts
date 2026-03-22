import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ============================================================
// SIGNAL TOOLS
// ============================================================
// These are special — they don't DO anything externally.
// Instead, they let Claude signal to OUR CODE that it's done.
//
// WHY is this needed?
// When Claude uses tools, it runs in a loop:
//   1. Claude thinks → decides to call a tool
//   2. Tool runs → returns result
//   3. Claude reads result → thinks again → maybe calls another tool
//   4. Repeat until maxTurns is reached
//
// Without signal_done, Claude would keep looping until it hits
// the turn limit. signal_done is like Claude saying "I'm finished,
// stop the loop." We'll intercept this in our code later.

export function signalTools() {
  return [
    tool(
      "signal_done",
      "Signal that you are done processing. You MUST call this when you have finished responding.",
      {
        reason: z
          .string()
          .describe('Why you are done (e.g., "responded to greeting")'),
      },
      async (args) => ({
        content: [
          {
            type: "text" as const,
            text: `Done. Reason: ${args.reason}`,
          },
        ],
      })
    ),
  ];
}
