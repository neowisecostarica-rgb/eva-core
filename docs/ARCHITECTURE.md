# EVA CORE — ARCHITECTURE v1.1

Documento oficial de arquitectura del sistema EVA Core.  
Este documento define la estructura real del proyecto, sus capas, responsabilidades, módulos y reglas de clasificación.

---

# 1. PROPÓSITO

Establecer una arquitectura clara, estable y entendible para:

- evitar desorden estructural
- evitar duplicación de responsabilidades
- clasificar correctamente módulos vivos y futuros
- permitir evolución controlada hacia EVA Platform

---

# 2. DEFINICIÓN DEL SISTEMA

EVA no es solo un bot.

EVA Core es el núcleo operativo de una plataforma comercial con IA compuesta por capas de:

- entrada de mensajes
- validación
- autenticación
- orquestación comercial
- memoria CRM
- seguimiento automático
- conectores
- respuesta al canal

---

# 3. VISIÓN ARQUITECTÓNICA

Arquitectura lógica del sistema:

```txt
Canal (WhatsApp / API / Web futuro)
   ↓
Routes Layer
   ↓
Validation Layer
   ↓
Auth Layer
   ↓
Core Orchestration (salesBrain)
   ↓
AI / Reply / Catalog / CRM Logic
   ↓
Persistence Layer (PostgreSQL)
   ↓
Connectors / Outbound
   ↓
Response to Channel
4. CAPAS OFICIALES
4.1 CHANNEL LAYER

Responsabilidad:

recibir eventos y mensajes desde canales externos

Componentes:

src/routes/whatsappWebhook.js
futuros conectores de web chat / API externa
4.2 ROUTES LAYER

Responsabilidad:

exponer endpoints
recibir requests
delegar al núcleo

Componentes:

src/routes/messages.js
src/routes/metrics.js
src/routes/whatsappWebhook.js
4.3 VALIDATION LAYER

Responsabilidad:

validar payloads antes del procesamiento

Componentes:

src/validators.js

Regla:

ningún payload entra al core sin validación mínima
4.4 AUTH LAYER

Responsabilidad:

autenticar organización
resolver organization_id
proteger endpoints multi-tenant

Componentes:

src/lib/auth.js

Regla:

organization_id viene del backend autenticado, no del cliente
4.5 CORE ORCHESTRATION LAYER

Responsabilidad:

orquestar el procesamiento completo del mensaje
coordinar intención, catálogo, memoria, respuesta y persistencia

Componente central:

src/salesBrain.js

Regla:

salesBrain.js es el cerebro operativo del sistema actual
4.6 DATA ACCESS LAYER

Responsabilidad:

centralizar acceso a PostgreSQL

Componente:

src/db.js

Regla:

toda conexión y query compartida debe alinearse con esta capa
4.7 CRM / MEMORY LAYER

Responsabilidad:

guardar contexto comercial
mantener historial
sostener continuidad conversacional

Fuentes clave:

leads
conversations
messages
customer_profiles
pipeline_events
followups
4.8 FOLLOWUP LAYER

Responsabilidad:

programar y ejecutar seguimientos automáticos

Componente:

src/followupWorker.js
4.9 CONNECTORS LAYER

Responsabilidad:

enviar mensajes hacia sistemas externos
abstraer integración por canal

Componentes:

src/connectors/whatsapp.js
4.10 BRAIN SUPPORT LAYER

Responsabilidad:

separar utilidades y módulos auxiliares del cerebro comercial

Componentes:

src/brain/engines/*
src/brain/replies/*
src/brain/utils/*

Regla:

esta capa apoya al core; no debe competir con él
5. ESTRUCTURA REAL DEL PROYECTO
src/
  server.js
  db.js
  salesBrain.js
  validators.js
  followupWorker.js

  routes/
    messages.js
    metrics.js
    whatsappWebhook.js

  lib/
    auth.js
    security.js

  connectors/
    whatsapp.js

  brain/
    engines/
    replies/
    utils/
6. CLASIFICACIÓN OFICIAL DE MÓDULOS

Todos los archivos del proyecto deben clasificarse bajo una de estas categorías:

6.1 CORE

Módulos vivos, activos y necesarios para el runtime actual.

Ejemplos:

src/server.js
src/db.js
src/salesBrain.js
src/routes/messages.js
src/routes/metrics.js
src/routes/whatsappWebhook.js
src/lib/auth.js
src/validators.js
src/followupWorker.js
src/connectors/whatsapp.js
6.2 TRANSITION

Módulos parcialmente activos, en migración o en consolidación.

Ejemplos posibles:

lógica duplicada que aún no ha sido absorbida por el core
piezas del folder brain/ que todavía coexisten con salesBrain.js

Regla:

no borrar sin auditoría
no expandir sin criterio
6.3 FUTURE

Módulos reservados para evolución futura del producto.

Ejemplos:

dashboard ejecutivo
CRM visual completo
capa de inteligencia avanzada
API pública expandida
AI layer desacoplada formalmente

Regla:

no se trata como deuda técnica por defecto
6.4 LEGACY

Módulos obsoletos o no alineados al runtime actual.

Regla:

no se conectan al core nuevo
deben marcarse explícitamente antes de eliminarse
7. ARCHIVOS Y RESPONSABILIDADES
src/server.js

Inicializa servidor, middlewares y rutas.

src/db.js

Administra acceso a base de datos.

src/salesBrain.js

Orquesta el procesamiento comercial principal.

src/validators.js

Valida payloads de entrada.

src/followupWorker.js

Gestiona ejecución de seguimientos.

src/routes/messages.js

Endpoint principal de inbound.

src/routes/metrics.js

Expone métricas del sistema.

src/routes/whatsappWebhook.js

Recibe mensajes desde Meta / WhatsApp.

src/lib/auth.js

Resuelve autenticación por API key y contexto de organización.

src/lib/security.js

Apoya reglas de endurecimiento y seguridad.

src/connectors/whatsapp.js

Encapsula envío outbound a WhatsApp.

src/brain/*

Capa auxiliar modular para engines, replies y utils del cerebro.

8. FLUJO OFICIAL DEL MENSAJE
WhatsApp / Canal externo
   ↓
whatsappWebhook.js
   ↓
POST /v1/messages/inbound
   ↓
validators.js
   ↓
auth.js
   ↓
salesBrain.js
   ↓
buscar / crear lead
   ↓
buscar / crear conversation
   ↓
guardar inbound message
   ↓
detectar intent / stage / entities
   ↓
buscar catálogo si aplica
   ↓
generar reply
   ↓
guardar outbound message
   ↓
actualizar lead / customer profile / pipeline
   ↓
crear followup si aplica
   ↓
responder al canal
9. REGLAS DE ARQUITECTURA
9.1 UN SOLO CEREBRO ACTIVO

El sistema no debe tener múltiples núcleos compitiendo entre sí.

Regla:

el runtime actual debe tener una única capa de orquestación principal
9.2 UNA RESPONSABILIDAD POR MÓDULO

Cada archivo debe tener una función clara.

Prohibido:

mezclar webhook + lógica comercial + SQL + respuesta IA en un mismo lugar si ya existe capa separada
9.3 NO DUPLICAR CAPAS

Si una responsabilidad ya existe:

se reutiliza
no se reinventa
9.4 NO BORRAR SIN CLASIFICAR

Antes de borrar cualquier archivo:

clasificar como CORE / TRANSITION / FUTURE / LEGACY
9.5 EL CORE MANDA

La arquitectura viva del sistema se define por el runtime actual, no por ideas futuras.

10. ESTADO ARQUITECTÓNICO ACTUAL

Estado estimado del proyecto:

núcleo operativo: sólido
arquitectura general: funcional
followups: funcionales pero mejorables
métricas: funcionales pero básicas
IA conversacional completa: pendiente
dashboard completo: pendiente
API pública expandida: futura

Conclusión:

EVA no está en fase de inventarse
EVA está en fase de consolidación y endurecimiento
11. EVOLUCIÓN FUTURA ESPERADA

La evolución natural del sistema es:

EVA Core
   ↓
EVA AI Layer desacoplada
   ↓
EVA Dashboard
   ↓
EVA Platform multi-tenant completa
   ↓
API pública y conectores externos
12. REGLA DE ORO

Si una decisión arquitectónica agrega complejidad sin cerrar una responsabilidad real, no se aprueba.

13. DEFINICIÓN FINAL

Este documento es la referencia oficial de arquitectura de EVA Core.

Toda modificación estructural del proyecto debe respetar:

SYSTEM_LANGUAGE.md
SOT_CORE.md
este documento ARCHITECTURE.md

Si el código contradice esta arquitectura, el código debe corregirse.
