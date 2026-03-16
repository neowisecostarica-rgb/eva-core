/*
====================================================
EVA BRAIN — TEXT UTILITIES
====================================================

Responsabilidad:
Funciones de normalización y manipulación de texto
usadas por el brain y otros módulos.

Estas utilidades deben ser puras y reutilizables.
====================================================
*/


/*
====================================================
NORMALIZE TEXT
Convierte texto a formato comparable
====================================================
*/

export function normalizeText(value = "") {

  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

}


/*
====================================================
NORMALIZE PHONE
Elimina caracteres no numéricos
====================================================
*/

export function normalizePhone(phone = "") {

  return String(phone).replace(/\D/g, "");

}
