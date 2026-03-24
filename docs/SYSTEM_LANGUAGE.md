# EVA CORE — SYSTEM LANGUAGE v1.1 (EXECUTABLE)

Documento oficial de lenguaje del sistema EVA Core.
Este documento define las reglas obligatorias de naming, contratos, arquitectura y comportamiento del sistema.

---

# 1. PROPÓSITO

Establecer un lenguaje unificado para:

* Código
* Arquitectura
* APIs
* Base de datos
* IA
* Operación

---

# 2. PRINCIPIOS FUNDAMENTALES

* Nombrar bien es arquitectura
* Un concepto = un nombre
* No hay código sin semántica clara
* El código debe ser predecible
* La IA no reemplaza estructura

---

# 3. IDIOMA OFICIAL

* Código → inglés
* Documentación → español

---

# 4. NAMING CONVENTION (OBLIGATORIO)

## 4.1 Variables estándar

```js
organization_id
phone
text
channel
message_id
intent
confidence
reply
```

## 4.2 Reglas

* snake_case SIEMPRE para datos
* camelCase SOLO para funciones
* nombres explícitos y completos

## 4.3 PROHIBIDO

```js
orgId
organizationId
msg
userPhone
data1
temp
```

---

# 5. INPUT CONTRACT (INBOUND)

Todo mensaje que entra al sistema debe cumplir:

```json
{
  "organization_id": "string",
  "phone": "string",
  "text": "string",
  "channel": "whatsapp",
  "message_id": "string | null"
}
```

## 5.1 Reglas

* organization_id es obligatorio a nivel backend
* NUNCA confiar en el cliente
* se debe forzar desde auth middleware

---

# 6. OUTPUT CONTRACT (EVA RESPONSE)

```json
{
  "success": true,
  "reply": {
    "text": "string"
  },
  "meta": {
    "intent": "BUY | INFO | SUPPORT | GREETING",
    "confidence": 0-100
  }
}
```

## 6.1 Reglas

* reply SIEMPRE es objeto
* reply.text SIEMPRE existe si success = true
* NUNCA devolver string plano

---

# 7. RESPONSE RULE

## Correcto

```json
{
  "reply": {
    "text": "Hola 😊"
  }
}
```

## Incorrecto

```json
{
  "reply": "Hola"
}
```

---

# 8. MULTI-TENANT RULE (CRÍTICO)

## Regla

El sistema SIEMPRE controla organization_id.

## Correcto

```js
organization_id = req.organization.id;
```

## PROHIBIDO

```js
organization_id: "default-org"
```

---

# 9. IDEMPOTENCIA (BASE)

## Regla

Un mismo mensaje no puede procesarse dos veces.

## Clave base

```js
idempotency_key = phone + text + timestamp_bucket;
```

## Reglas

* Debe existir control en DB
* Debe prevenir duplicación de leads
* Debe prevenir doble respuesta

---

# 10. AI RULE (CRÍTICA)

## Regla

EVA es AI-first.

## PROHIBIDO

```js
if (text.includes("precio")) return "₡100k";
```

## CORRECTO

* IA decide usando:

  * contexto
  * catálogo
  * memoria
  * intención

---

# 11. CATÁLOGO RULE

* El catálogo es la fuente de verdad comercial
* NO hardcodear productos
* SIEMPRE usar estructura de datos

---

# 12. MÓDULOS DEL SISTEMA

```txt
CORE → sistema activo
TRANSITION → migración
FUTURE → no activo
LEGACY → eliminar progresivamente
```

---

# 13. ESTRUCTURA BASE

```bash
src/
  server.js
  db.js
  salesBrain.js
  routes/
  brain/
  lib/
  connectors/
```

---

# 14. IMPORT RULE

* rutas claras
* evitar duplicaciones
* no importar desde legacy sin validación

---

# 15. VALIDATION RULE

* todo input debe validarse
* validators.js es obligatorio
* nunca asumir datos correctos

---

# 16. LOGGING RULE

* logs claros
* logs estructurados
* evitar ruido innecesario

---

# 17. ERROR HANDLING

* nunca romper flujo
* siempre responder status controlado
* logs internos detallados

---

# 18. FOLLOW-UP RULE

* followups son automáticos
* no dependen del usuario
* deben ser idempotentes

---

# 19. SECURITY RULE

* API protegida por API KEY
* rate limiting recomendado
* nunca exponer lógica interna

---

# 20. REGLA DE ORO

Si un término no está claro → NO se programa

---

# 21. DEFINICIÓN FINAL

Este documento es la fuente oficial del lenguaje del sistema EVA Core.

Cualquier cambio en el sistema debe respetar este documento.

---
