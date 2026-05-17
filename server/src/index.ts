import { app } from "./app";
import { connectDatabase } from "./config/database";

const port = Number(process.env.PORT) || 3001;

async function main() {
  await connectDatabase();
  console.log("Database connection established.");

  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
