import { createServer } from "node:http";
import { SERVER_CONFIG } from "./config/env.js";
import { openPlatformDatabase, verifyPostgresConnection } from "./db/database.js";
import { createPlatformApp } from "./app.js";

const main = async () => {
  const db = await openPlatformDatabase();
  const postgresStatus = await verifyPostgresConnection(SERVER_CONFIG.databaseUrl);
  const ctx = createPlatformApp(db, { postgresStatus });

  const server = createServer(ctx.app);
  server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    console.log(
      JSON.stringify({
        event: "aetherforge_listening",
        host: SERVER_CONFIG.host,
        port: SERVER_CONFIG.port,
        nodeEnv: SERVER_CONFIG.nodeEnv,
      }),
    );
  });

  const handleSignal = async () => {
    await ctx.shutdown();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
};

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
