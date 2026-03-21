import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import messagesRouter from "./routes/messages.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  return res.json({
    ok: true,
    service: "eva-core"
  });
});

app.use("/v1/messages", messagesRouter);

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});
