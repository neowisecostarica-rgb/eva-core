// src/lib/auth.js

export async function authenticate(req, res, next) {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        error: "API key requerida",
      });
    }

    const VALID_API_KEY = process.env.EVA_API_KEY;

    if (!VALID_API_KEY) {
      console.error("❌ EVA_API_KEY no configurada en ENV");
      return res.status(500).json({
        error: "Server misconfigured",
      });
    }

    if (apiKey !== VALID_API_KEY) {
      return res.status(403).json({
        error: "API key inválida",
      });
    }

    const orgId = process.env.ORG_PRIMARY;

    if (!orgId) {
      console.error("❌ ORG_PRIMARY no definido");
      return res.status(500).json({
        error: "Organization no configurada",
      });
    }

    // 🔒 SOURCE OF TRUTH
    req.organization = {
      id: orgId,
    };

    console.log("🔐 AUTH OK:", orgId);

    next();
  } catch (err) {
    console.error("❌ AUTH ERROR:", err);
    return res.status(500).json({
      error: "Error en autenticación",
    });
  }
}
