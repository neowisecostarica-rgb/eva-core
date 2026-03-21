import { CONFIG } from "./config.js";

export function validateEnv() {
  const missing = [];

  for (const key of CONFIG.env.REQUIRED) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error("❌ Missing ENV variables:");
    missing.forEach((v) => console.error(" -", v));

    process.exit(1);
  }

  console.log("✅ ENV validated");
}
