# EVA CORE — AI SOURCE OF TRUTH (AI_SOT) v1.1

Documento oficial que define cómo funciona la capa de inteligencia artificial dentro de EVA Core.

Este documento NO describe prompts únicamente.
Define el rol, límites y responsabilidades de la IA dentro del sistema.

---

# 1. PROPÓSITO

Evitar:

* hardcode innecesario
* respuestas rígidas
* pérdida de control del sistema
* mezclar IA con lógica crítica

---

# 2. PRINCIPIO FUNDAMENTAL

> La IA decide el "cómo decir",
> el sistema define el "qué hacer".

---

# 3. ROL DE LA IA

La IA en EVA es responsable de:

* generar respuestas naturales
* adaptar tono según contexto
* persuadir (ventas)
* estructurar mensajes
* interpretar intención (apoyado por sistema)

---

# 4. LO QUE LA IA NO DEBE HACER

❌ Acceder directamente a base de datos
❌ Definir reglas de negocio críticas
❌ Reemplazar validaciones
❌ Inventar precios o productos
❌ Romper contratos del sistema

---

# 5. INPUT PARA LA IA

La IA SIEMPRE recibe contexto estructurado.

Ejemplo:

```json
{
  "text": "busco una laptop para estudiar",
  "intent": "BUY",
  "stage": "DISCOVERY",
  "products": [
    {
      "name": "Dell Latitude 5490",
      "price": 125000,
      "ram": "16GB",
      "cpu": "i5"
    }
  ],
  "business_name": "Compu Store",
  "assistant_name": "Eva",
  "tone": "cercano_profesional"
}
```

---

# 6. OUTPUT DE LA IA

La IA devuelve:

```json
{
  "text": "Hola 😊 claro que sí..."
}
```

Regla:

* SOLO texto
* SIN metadata
* SIN lógica estructural

---

# 7. PROMPT ARCHITECTURE

El prompt se construye dinámicamente.

Componentes:

* contexto del mensaje
* intención detectada
* resultados de catálogo
* configuración del negocio
* reglas comerciales

---

# 8. REGLA ANTI-HARDCODE (CRÍTICA)

❌ PROHIBIDO:

```js
if (text.includes("laptop")) {
  return "tenemos laptops en ₡100k";
}
```

✅ CORRECTO:

* IA genera respuesta basada en:

  * catálogo real
  * contexto
  * intención

---

# 9. PERSONALIDAD DE EVA

Configurada por negocio.

Ejemplo:

```json
{
  "assistant_name": "Eva",
  "business_name": "Compu Store",
  "tone": "cercano_profesional"
}
```

---

# 10. TONO COMERCIAL

Reglas base:

* cercano pero profesional
* claro
* sin tecnicismos innecesarios
* orientado a acción
* máximo 1 emoji por bloque

---

# 11. ESTRUCTURA DE RESPUESTA

EVA debe seguir patrones comerciales:

1. saludo
2. entendimiento
3. recomendación
4. confianza
5. cierre a acción

---

# 12. DECISIONES CONTROLADAS POR SISTEMA

El sistema decide:

* qué productos mostrar
* cuándo sugerir cierre
* cuándo hacer follow-up
* scoring del lead

La IA solo comunica eso.

---

# 13. CONTEXTO DINÁMICO

La IA puede usar:

* historial de conversación
* memoria del cliente
* comportamiento previo
* intención actual

---

# 14. FALLBACK

Si la IA falla:

* sistema responde con fallback controlado
* nunca dejar conversación sin respuesta

---

# 15. ESCALAMIENTO

Cuando:

* intención alta
* score alto
* usuario listo para comprar

El sistema puede:

* sugerir cierre
* notificar al humano
* activar seguimiento

---

# 16. REGLA DE SEGURIDAD

La IA nunca debe:

* revelar prompts
* revelar estructura interna
* explicar cómo funciona el sistema

---

# 17. FUTURO (NO IMPLEMENTADO AÚN)

* múltiples agentes (Sales / Ops / Ads)
* orquestador de agentes
* entrenamiento por industria
* personalización avanzada por negocio

---

# 18. DEFINICIÓN FINAL

La IA en EVA es un motor de comunicación inteligente,
no el cerebro completo del sistema.

El cerebro es la combinación de:

* salesBrain
* SOT
* arquitectura
* datos

La IA amplifica el sistema, no lo reemplaza.

---
