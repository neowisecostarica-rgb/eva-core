export function splitReply(text) {
  if (!text) return [];

  // limpiar espacios
  const clean = text.trim();

  // dividir por doble salto de línea (bloques naturales)
  let parts = clean.split(/\n\s*\n/);

  // fallback si viene todo pegado
  if (parts.length === 1) {
    parts = clean.split(/(?<=[.!?])\s+/);
  }

  // limitar a máximo 2 mensajes
  return parts.slice(0, 2);
}
