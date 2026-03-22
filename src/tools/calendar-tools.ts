import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { db, ensureMongo } from "../db.js";

// ============================================================
// CALENDAR / ARRANGEMENT TOOLS
// ============================================================
// Uses shared MongoDB connection to store arrangements.

const arrangements = db.collection("arrangements");

export function calendarTools() {
  return [
    // --------------------------------------------------------
    // TOOL: create_arrangement
    // --------------------------------------------------------
    tool(
      "create_arrangement",
      "Create a new arrangement/event/reminder. Use this when a user wants to schedule something.",
      {
        chat_id: z.string().describe("Telegram chat ID of the user"),
        title: z.string().describe("Title of the arrangement"),
        description: z
          .string()
          .optional()
          .describe("Optional description or notes"),
        date: z
          .string()
          .describe(
            "Date and time in ISO format (e.g. '2026-03-25T14:00:00'). Use get_current_time first if you need to know the current date."
          ),
      },
      async (args) => {
        try {
          await ensureMongo();

          const doc = {
            chatId: args.chat_id,
            title: args.title,
            description: args.description || "",
            date: new Date(args.date),
            createdAt: new Date(),
          };

          const result = await arrangements.insertOne(doc);

          console.log(
            `[Tool:create_arrangement] "${args.title}" for chat ${args.chat_id}`
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  id: result.insertedId.toString(),
                  title: args.title,
                  date: args.date,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating arrangement: ${err}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // --------------------------------------------------------
    // TOOL: list_arrangements
    // --------------------------------------------------------
    tool(
      "list_arrangements",
      "List arrangements/events for a user. Can show upcoming, all, or past arrangements.",
      {
        chat_id: z.string().describe("Telegram chat ID of the user"),
        filter: z
          .enum(["upcoming", "past", "all"])
          .default("upcoming")
          .describe("Filter: 'upcoming' (future only), 'past', or 'all'"),
      },
      async (args) => {
        try {
          await ensureMongo();

          const now = new Date();
          let query: Record<string, unknown> = { chatId: args.chat_id };

          if (args.filter === "upcoming") {
            query.date = { $gte: now };
          } else if (args.filter === "past") {
            query.date = { $lt: now };
          }

          const docs = await arrangements
            .find(query)
            .sort({ date: 1 })
            .limit(20)
            .toArray();

          if (docs.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No ${args.filter} arrangements found.`,
                },
              ],
            };
          }

          const items = docs.map((doc) => ({
            id: doc._id.toString(),
            title: doc.title,
            description: doc.description,
            date: doc.date,
          }));

          console.log(
            `[Tool:list_arrangements] Found ${items.length} for chat ${args.chat_id}`
          );

          return {
            content: [{ type: "text" as const, text: JSON.stringify(items) }],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error listing arrangements: ${err}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),

    // --------------------------------------------------------
    // TOOL: delete_arrangement
    // --------------------------------------------------------
    tool(
      "delete_arrangement",
      "Delete an arrangement by its ID. Use list_arrangements first to find the ID.",
      {
        id: z.string().describe("The arrangement ID to delete"),
      },
      async (args) => {
        try {
          await ensureMongo();

          const result = await arrangements.deleteOne({
            _id: new ObjectId(args.id),
          });

          if (result.deletedCount === 0) {
            return {
              content: [
                { type: "text" as const, text: "Arrangement not found." },
              ],
            };
          }

          console.log(`[Tool:delete_arrangement] Deleted ${args.id}`);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, deleted: args.id }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error deleting arrangement: ${err}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),
  ];
}
