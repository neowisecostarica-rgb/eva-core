export function enhanceProductReply({
  reply,
  intent,
  catalogMatches = [],
  data = {}
}) {

  if (!catalogMatches || catalogMatches.length === 0) {
    return reply;
  }

  const first = catalogMatches[0];

  const price =
    first.currency === "CRC"
      ? `₡${Number(first.price).toLocaleString("es-CR")}`
      : `${first.price} ${first.currency}`;

  const interest = data?.interest_level || "LOW";

  if (interest === "HIGH") {

    return `Te recomiendo esta opción:\n\n💻 ${first.name}\n${price}\n\nEs una de las más buscadas por nuestros clientes. ¿Quieres que te envíe fotos reales?`;

  }

  if (interest === "MEDIUM") {

    return `Una opción que suele funcionar muy bien es esta:\n\n💻 ${first.name}\n${price}\n\n¿Quieres ver fotos reales del equipo?`;

  }

  return reply;

}
