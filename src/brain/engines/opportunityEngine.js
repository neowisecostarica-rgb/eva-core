/*
====================================================
EVA OPPORTUNITY ENGINE
Detecta oportunidades de venta adicionales
====================================================

Este motor identifica productos o servicios
que pueden complementar la necesidad del cliente.

Ejemplo:

Cliente pregunta por laptop
→ oportunidad: monitor portátil

Cliente menciona impresora
→ oportunidad: mantenimiento

Esto permite aumentar el ticket promedio.
====================================================
*/

function normalize(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectOpportunities(text = "") {

  const t = normalize(text);

  const opportunities = [];

  /*
  ----------------------------------------------------
  LAPTOP
  ----------------------------------------------------
  */

  if (t.includes("laptop") || t.includes("computadora")) {

    opportunities.push("monitor_portable");
    opportunities.push("ram_upgrade");
    opportunities.push("ssd_upgrade");

  }

  /*
  ----------------------------------------------------
  PRINTER
  ----------------------------------------------------
  */

  if (t.includes("impresora") || t.includes("printer")) {

    opportunities.push("printer_maintenance");

  }

  /*
  ----------------------------------------------------
  PERFORMANCE
  ----------------------------------------------------
  */

  if (t.includes("lenta") || t.includes("slow")) {

    opportunities.push("ssd_upgrade");

  }

  return opportunities;

}
