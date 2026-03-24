# EVA CORE — SOURCE OF TRUTH (SOT) v1.1

Documento oficial que define la fuente de verdad del sistema EVA Core.
Este documento describe qué partes del sistema son autoridad, cómo fluye la información y qué reglas deben respetarse.

---

# 1. PROPÓSITO

Evitar:

* duplicación de lógica
* inconsistencias
* decisiones ambiguas
* errores por desalineación

---

# 2. PRINCIPIO FUNDAMENTAL

> Cada dato tiene una única fuente de verdad

---

# 3. CAPAS DEL SISTEMA

## 3.1 CAPA DE ENTRADA (INPUT LAYER)

Origen:

* WhatsApp Webhook
* API externa
* Web Chat (futuro)

Entrada estándar:

```json
{
  "organization_id": "string",
  "phone": "string",
  "text": "string",
  "channel": "string",
  "message_id": "string | null"
}
```

---

## 3.2 CAPA DE PROCESAMIENTO (CORE LOGIC)

Archivo principal:

```bash
src/salesBrain.js
```

Responsabilidades:

* orquestar flujo
* detectar intención
* consultar catálogo
* generar respuesta
* registrar eventos

---

## 3.3 CAPA DE IA (AI LAYER)

Responsabilidad:

* generar respuesta natural
* adaptar tono
* decidir enfoque comercial

Regla:

* NO contiene lógica de negocio crítica
* NO reemplaza validaciones
* NO accede directo a DB

---

## 3.4 CAPA DE DATOS (DATA LAYER)

Base de datos PostgreSQL

Tablas clave:

```txt
organizations
leads
conversations
messages
customer_profiles
pipeline_events
followups
eva_usage
```

---

# 4. FUENTES DE VERDAD (CRÍTICO)

## 4.1 Leads → CRM principal

* fuente de verdad comercial
* estado del cliente
* nivel de interés

---

## 4.2 Conversations / Messages → historial

* contexto conversacional
* memoria de interacción

---

## 4.3 Customer Profiles → memoria enriquecida

* preferencias
* comportamiento
* historial agregado

---

## 4.4 Product Catalog → fuente comercial

* productos
* precios
* atributos
* uso recomendado

Regla:

* nunca hardcodear productos en código

---

# 5. FLUJO OFICIAL DEL SISTEMA

```txt
Webhook / API
   ↓
Validator
   ↓
Auth (organization_id)
   ↓
Idempotency check
   ↓
salesBrain
   ↓
AI Layer
   ↓
DB (save events)
   ↓
Response
   ↓
Canal (WhatsApp)
```

---

# 6. REGLAS DE ORO

## 6.1 NO DUPLICAR LÓGICA

* lógica vive en un solo lugar
* evitar múltiples versiones

---

## 6.2 NO HARDCODE

Prohibido:

* precios en código
* respuestas fijas
* lógica comercial manual

---

## 6.3 VALIDACIÓN OBLIGATORIA

* todo input pasa por validators.js
* nunca confiar en datos externos

---

## 6.4 MULTI-TENANT REAL

* organization_id controla todo
* aislamiento por cliente

---

## 6.5 IDEMPOTENCIA

* no duplicar mensajes
* no duplicar leads
* no duplicar respuestas

---

# 7. RESPONSABILIDADES POR MÓDULO

## server.js

* inicialización del sistema

## routes/messages.js

* entrada principal de mensajes

## routes/whatsappWebhook.js

* integración con WhatsApp

## salesBrain.js

* cerebro del sistema

## db.js

* acceso a base de datos

## validators.js

* validación de datos

## followupWorker.js

* automatización de seguimientos

---

# 8. CONTRATO DEL SISTEMA

## INPUT

```json
{
  "organization_id": "string",
  "phone": "string",
  "text": "string",
  "channel": "string"
}
```

## OUTPUT

```json
{
  "success": true,
  "reply": {
    "text": "string"
  },
  "meta": {
    "intent": "string",
    "confidence": 0-100
  }
}
```

---

# 9. EVENTOS DEL SISTEMA

Eventos clave:

```txt
MESSAGE_RECEIVED
INTENT_DETECTED
PRODUCT_MATCHED
REPLY_GENERATED
LEAD_UPDATED
FOLLOWUP_SCHEDULED
```

---

# 10. ERRORES COMUNES A EVITAR

* duplicar lógica en varios archivos
* mezclar IA con reglas de negocio
* usar default-org
* hardcodear respuestas
* no validar inputs
* romper contratos

---

# 11. DEFINICIÓN FINAL

Este documento es la referencia oficial de cómo funciona EVA Core.

Si algo contradice este documento:
👉 el código está mal
👉 no el documento

---
