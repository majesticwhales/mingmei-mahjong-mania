import cors from "cors";
import express from "express";

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
