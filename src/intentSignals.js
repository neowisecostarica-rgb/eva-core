export function matchHotSignals(text = "", signals = []) {
  if (!text || !signals || signals.length === 0) return false;

  const t = text.toLowerCase();

  return signals.some((s) => t.includes(String(s).toLowerCase()));
}

export function getHotSignals(orgConfig = {}) {
  // 🔥 ORG configurable
  if (orgConfig?.hot_signals && Array.isArray(orgConfig.hot_signals)) {
    return orgConfig.hot_signals;
  }

  // 🔥 fallback universal (NO Compu Store)
  return [
    "comprar",
    "adquirir",
    "reservar",
    "apartar",
    "lo quiero",
    "me interesa",
    "precio",
    "cotizar",
  ];
}
