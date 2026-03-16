/*
----------------------------------------------------
BLOQUE 9 — EVA MEMORY ENGINE
----------------------------------------------------

Permite recuperar memoria del cliente
para usar contexto en la conversación.

Memoria almacenada en:
customer_profiles.profile_json
*/

export function mergeCustomerMemory({
  memory = {},
  product_interest,
  use_case,
  budget,
  pipeline_event
}) {

  const updatedMemory = { ...memory };

  if (product_interest) {
    updatedMemory.product_interest = product_interest;
  }

  if (use_case) {
    updatedMemory.use_case = use_case;
  }

  if (budget) {
    updatedMemory.budget = budget;
  }

  if (pipeline_event) {
    updatedMemory.last_pipeline_event = pipeline_event;
  }

  updatedMemory.last_updated = new Date().toISOString();

  return updatedMemory;
}
