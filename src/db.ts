import { MongoClient } from "mongodb";

// ============================================================
// SHARED MONGODB CONNECTION
// ============================================================
// Single MongoClient shared across the entire app.
// Every module imports from here instead of creating its own.

const mongoClient = new MongoClient(process.env.MONGODB_URI!);
const db = mongoClient.db("NatsukiAgent");

let connected = false;

export async function ensureMongo() {
  if (!connected) {
    await mongoClient.connect();
    connected = true;
    console.log("[MongoDB] Connected");
  }
}

export { db };
