/*
====================================================
EVA CORE — SPLIT REPLY (STABILIZATION FIX)
====================================================
*/

export function splitReply(text) {
  if (!text) return [];

  // limpiar espacios
  const clean = text.trim();

  // 🔥 FIX: siempre devolver un solo mensaje
  // Evita duplicidad visual en WhatsApp
  return [clean];
}
