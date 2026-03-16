/*
====================================================
EVA MEDIA ENGINE
Product Image Delivery
====================================================

Responsabilidad:

Extraer imágenes de productos desde el catálogo
para que EVA pueda enviarlas al cliente cuando
recomienda un producto.

Este motor NO decide cuándo enviar imágenes.
Solo extrae URLs válidas desde el producto.

El Reply Engine decide cuándo usar estas imágenes.

====================================================
*/

export function extractProductImages(product) {

  if (!product) return [];

  if (!product.image_urls) return [];

  try {

    /*
    Si ya es array (PostgreSQL JSONB parseado)
    */

    if (Array.isArray(product.image_urls)) {
      return product.image_urls;
    }

    /*
    Si viene como string JSON
    */

    return JSON.parse(product.image_urls);

  } catch (err) {

    return [];

  }

}
