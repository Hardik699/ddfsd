import { MongoClient, Db } from "mongodb";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://admin:admin1@cluster0.a3duo.mongodb.net/?appName=Cluster0";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

function resetConnection() {
  cachedClient = null;
  cachedDb = null;
  connectionPromise = null;
}

export async function getDatabase(): Promise<Db> {
  // If we have a valid cached connection, return it
  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  // If a connection is already in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      // Close any existing dead connection
      if (cachedClient) {
        try { await cachedClient.close(true); } catch {}
        resetConnection();
      }

      console.log("🔌 Connecting to MongoDB...");

      const client = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 20000,
        connectTimeoutMS: 20000,
        socketTimeoutMS: 120000,  // 2 minutes for large queries
        family: 4,
        retryWrites: true,
        retryReads: true,
        maxIdleTimeMS: 120000,
        waitQueueTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
      });

      await client.connect();
      console.log("✅ MongoDB connected (shared connection)");

      cachedClient = client;
      cachedDb = client.db("upload_system");

      // Auto-reconnect on errors
      client.on("error", (err) => {
        console.error("❌ MongoDB error:", err.message);
        resetConnection();
      });

      client.on("close", () => {
        console.warn("⚠️ MongoDB connection closed");
        resetConnection();
      });

      client.on("timeout", () => {
        console.warn("⚠️ MongoDB connection timeout");
        resetConnection();
      });

      return cachedDb;
    } catch (error) {
      resetConnection();
      console.error("❌ MongoDB connection failed:", error instanceof Error ? error.message : error);
      throw new Error(
        "Database connection failed: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  })();

  return connectionPromise;
}
