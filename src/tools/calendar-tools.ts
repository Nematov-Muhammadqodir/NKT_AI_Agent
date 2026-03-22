import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { MongoClient, ObjectId } from "mongodb";

// ============================================================
// CALENDAR / ARRANGEMENT TOOLS
// ============================================================
// Uses MongoDB to store and manage arrangements (events).
// Claude can create, list, and delete arrangements for users.
//
// Each arrangement has:
//   - title, description, date/time
//   - userId (Telegram chat ID so each user has their own)

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db("NatsukiAgent");
const arrangements = db.collection("arrangements");

// Connect once at startup
let connected = false;
async function ensureConnected() {
  if (!connected) {
    await client.connect();
    connected = true;
    console.log("[MongoDB] Connected");
  }
}

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
          await ensureConnected();

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
          await ensureConnected();

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
          await ensureConnected();

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
