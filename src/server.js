import express from "express";
import dotenv from "dotenv";

import { validateInbound } from "./validators.js";
import { handleInbound } from "./salesBrain.js";

dotenv.config();

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    service: "eva-core",
    version: "bundle-quirurgico-server-v1"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "eva-core",
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const payload = validateInbound(req.body);

    const result = await handleInbound(payload);

    return res.json({
      ok: true,
      reply: result.reply,
      intent: result.intent,
      stage: result.stage,
      catalog_matches: result.catalog_matches
    });
  } catch (error) {
    console.error("[/v1/messages/inbound] error:", error);

    const isValidationError =
      error.message?.includes("required") ||
      error.message?.includes("invalid");

    return res.status(isValidationError ? 400 : 500).json({
      ok: false,
      error: isValidationError ? error.message : "server_error"
    });
  }
});

app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    error: "not_found"
  });
});

app.use((error, req, res, next) => {
  console.error("[unhandled-express-error]", error);

  return res.status(500).json({
    ok: false,
    error: "server_error"
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`EVA Core listening on port ${port}`);
});
