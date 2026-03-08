import express from "express";
import dotenv from "dotenv";

import { validateInbound } from "./validators.js";
import { handleInbound } from "./salesBrain.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀"
  });
});

app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const payload = validateInbound(req.body);

    const result = await handleInbound(payload);

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(400).json({
      error: err.message
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("EVA Core listening on", port);
});
