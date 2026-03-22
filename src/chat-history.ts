import { MongoClient } from "mongodb";

// ============================================================
// CHAT HISTORY
// ============================================================
// Stores conversation history per chatId in MongoDB.
// Each time a user sends a message, we save both the user's
// message and Claude's response. On the next message, we load
// recent history so Claude remembers the conversation.

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db("NatsukiAgent");
const history = db.collection("chat_history");

let connected = false;
async function ensureConnected() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
}

// How many recent messages to include as context
const MAX_HISTORY = 20;

export async function getHistory(
  chatId: number
): Promise<Array<{ role: string; name: string; text: string }>> {
  await ensureConnected();

  const docs = await history
    .find({ chatId })
    .sort({ timestamp: -1 })
    .limit(MAX_HISTORY)
    .toArray();

  // Reverse so oldest is first (chronological order)
  return docs.reverse().map((doc) => ({
    role: doc.role,
    name: doc.name,
    text: doc.text,
  }));
}

export async function saveMessage(
  chatId: number,
  role: "user" | "assistant",
  name: string,
  text: string
): Promise<void> {
  await ensureConnected();

  await history.insertOne({
    chatId,
    role,
    name,
    text,
    timestamp: new Date(),
  });
}

// Format history into a string Claude can understand
export function formatHistory(
  messages: Array<{ role: string; name: string; text: string }>
): string {
  if (messages.length === 0) return "";

  const lines = messages.map((m) => {
    if (m.role === "user") {
      return `${m.name}: ${m.text}`;
    }
    return `Assistant: ${m.text}`;
  });

  return `--- CONVERSATION HISTORY ---\n${lines.join("\n")}\n--- END HISTORY ---\n\n`;
}
