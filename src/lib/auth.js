/*
====================================================
EVA AUTH LIB (P0 MULTI-TENANT HARDENED)
====================================================
*/

import pool from "../db.js";

/*
====================================================
HELPERS
====================================================
*/

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return null;
  }

  return token.trim();
}

function getApiKeyFromRequest(req) {
  return (
    getBearerToken(req) ||
    req.headers["x-api-key"] ||
    req.headers["x-eva-api-key"] ||
    null
  );
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function normalizeOrgId(value) {
  return value ? String(value).trim() : null;
}

/*
====================================================
LOAD API KEY RECORD
====================================================
Notas:
- Este query tolera 2 nombres de tabla comunes:
  1) api_keys
  2) eva_api_keys

- Y tolera columnas comunes:
  key / api_key / token
  organization_id
  is_active / active / enabled
====================================================
*/

async function loadApiKeyRecord(apiKey) {
  const candidates = [
    `
    SELECT
      id,
      organization_id,
      COALESCE(name, 'default') AS name,
      COALESCE(is_active, active, enabled, true) AS is_active
    FROM api_keys
    WHERE (
      key = $1
      OR api_key = $1
      OR token = $1
    )
    LIMIT 1
    `,
    `
    SELECT
      id,
      organization_id,
      COALESCE(name, 'default') AS name,
      COALESCE(is_active, active, enabled, true) AS is_active
    FROM eva_api_keys
    WHERE (
      key = $1
      OR api_key = $1
      OR token = $1
    )
    LIMIT 1
    `
  ];

  for (const query of candidates) {
    try {
      const result = await pool.query(query, [apiKey]);

      if (result.rows?.length) {
        return result.rows[0];
      }
    } catch (err) {
      /*
      ignoramos error de tabla/columna inexistente
      para permitir compatibilidad con esquemas cercanos
      */
    }
  }

  return null;
}

/*
====================================================
AUTHENTICATE API KEY
====================================================
Adjunta en req.auth:
{
  api_key_id,
  organization_id,
  api_key_name
}
====================================================
*/

export async function authenticateApiKey(req, res, next) {
  try {
    const apiKey = getApiKeyFromRequest(req);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "missing_api_key"
      });
    }

    const record = await loadApiKeyRecord(apiKey);

    if (!record) {
      return res.status(401).json({
        success: false,
        error: "invalid_api_key"
      });
    }

    if (!record.is_active) {
      return res.status(403).json({
        success: false,
        error: "api_key_inactive"
      });
    }

    req.auth = {
      api_key_id: record.id,
      organization_id: normalizeOrgId(record.organization_id),
      api_key_name: record.name
    };

    return next();
  } catch (err) {
    console.error("❌ auth error:", err.message);

    return res.status(500).json({
      success: false,
      error: "auth_error"
    });
  }
}

/*
====================================================
RESOLVE ORGANIZATION ID
====================================================
Fuente de verdad:
1) req.auth.organization_id
2) body/query/header solo si coincide
====================================================
*/

export function resolveOrganizationId(req) {
  const authOrgId = normalizeOrgId(req.auth?.organization_id);

  const requestedOrgId = normalizeOrgId(
    firstDefined(
      req.body?.organization_id,
      req.query?.organization_id,
      req.headers["x-organization-id"]
    )
  );

  return {
    authOrgId,
    requestedOrgId,
    organization_id: authOrgId || requestedOrgId || null
  };
}

/*
====================================================
REQUIRE ORGANIZATION MATCH
====================================================
Regla:
- Si la API key ya trae org -> esa manda
- Si el request manda organization_id distinto -> bloquear
====================================================
*/

export function requireOrganizationMatch(req, res, next) {
  const { authOrgId, requestedOrgId, organization_id } = resolveOrganizationId(req);

  if (!organization_id) {
    return res.status(400).json({
      success: false,
      error: "organization_id_required"
    });
  }

  if (authOrgId && requestedOrgId && authOrgId !== requestedOrgId) {
    return res.status(403).json({
      success: false,
      error: "cross_tenant_forbidden"
    });
  }

  req.organization_id = organization_id;

  return next();
}

/*
====================================================
OPTIONAL LAB MODE
====================================================
Uso temporal para laboratorio interno:
- permite DEFAULT_ORGANIZATION_ID solo si explicitly enabled
- nunca sobreescribe auth real
====================================================
*/

export function allowLabOrganizationFallback(req, res, next) {
  const enabled = String(process.env.ALLOW_LAB_ORG_FALLBACK || "").toLowerCase() === "true";

  if (!enabled) {
    return next();
  }

  if (!req.organization_id && process.env.DEFAULT_ORGANIZATION_ID) {
    req.organization_id = normalizeOrgId(process.env.DEFAULT_ORGANIZATION_ID);
  }

  return next();
}
