import express from "express";
import dotenv from "dotenv";

import messagesRoute from "./routes/messages.js";
import metricsRoute from "./routes/metrics.js";

dotenv.config();

const app = express();

app.use(express.json());

app.get("/", (req, res) => {

  res.json({
    status: "EVA Core running 🚀"
  });

});

app.use("/v1/messages", messagesRoute);
app.use("/v1/metrics", metricsRoute);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`EVA Core running on port ${PORT}`);

});
