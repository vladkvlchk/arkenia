import { config } from "./config";
import { initDb } from "./services/db";
import { startIndexer } from "./services/indexer";

async function main() {
  console.log("Indexer microservice starting...");

  await initDb();
  console.log("Database initialized");

  await startIndexer();
  console.log("Indexer running. Polling for new events...");
}

main().catch((err) => {
  console.error("Indexer failed:", err);
  process.exit(1);
});
