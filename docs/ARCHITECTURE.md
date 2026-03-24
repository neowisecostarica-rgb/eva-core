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
