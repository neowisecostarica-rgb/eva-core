/*
====================================================
EVA CORE — AUTH (Production Safe vNext)
====================================================
*/

export async function authenticate(req, res, next) {
  try {
    const rawApiKey =
      req.headers["x-api-key"] ||
      req.headers["authorization"] ||
      "";

    const apiKey = String(rawApiKey).startsWith("Bearer ")
      ? String(rawApiKey).slice(7).trim()
      : String(rawApiKey).trim();

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key requerida",
      });
    }

    const VALID_API_KEY = process.env.EVA_API_KEY;

    if (!VALID_API_KEY) {
      console.error("❌ EVA_API_KEY no configurada");
      return res.status(500).json({
        success: false,
        error: "Server misconfigured",
      });
    }

    if (apiKey !== VALID_API_KEY) {
      console.warn("⚠️ API key inválida");
      return res.status(403).json({
        success: false,
        error: "API key inválida",
      });
    }

    const orgId = process.env.ORG_PRIMARY;

    if (!orgId) {
      console.error("❌ ORG_PRIMARY no definido");
      return res.status(500).json({
        success: false,
        error: "Organization no configurada",
      });
    }

    req.organization = { id: orgId };
    req.organization_id = orgId;

    console.log("🔐 AUTH OK:", orgId);

    next();

  } catch (err) {
    console.error("❌ AUTH ERROR:", err.message);
    return res.status(500).json({
      success: false,
      error: "Error en autenticación",
    });
  }
}
