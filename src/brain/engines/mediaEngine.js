/*
====================================================
EVA MEDIA ENGINE
Product Image Delivery
====================================================

Responsabilidad:
Enviar imágenes de productos cuando el cliente
pide fotos o cuando EVA recomienda un producto.
*/

export function extractProductImages(product) {

  if (!product) return [];

  if (!product.image_urls) return [];

  try {

    if (Array.isArray(product.image_urls)) {
      return product.image_urls;
    }

    return JSON.parse(product.image_urls);

  } catch (err) {

    return [];

  }

}
