import { app } from "./app";
import { sequelize } from "./config/database";
import "reflect-metadata";

const port = Number(process.env.PORT) || 3001;

async function main() {
  await sequelize.authenticate();
  console.log("Database connection established.");

  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
