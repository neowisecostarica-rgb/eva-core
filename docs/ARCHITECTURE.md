# EVA — SYSTEM ARCHITECTURE (OFFICIAL)

## Project Status

EVA Core is NOT a broken project.

It is an audited system with ~85% MVP completion.

Current phase:
→ Stabilization
→ Hardening
→ Productization

---

## What EVA Really Is

EVA is NOT a chatbot.

EVA is a commercial platform composed of:

- EVA Core → execution engine
- EVA Sales Brain → commercial logic
- EVA CRM → memory + leads + conversations
- EVA Followups → automated recovery system
- EVA Analytics → metrics layer
- EVA AI Layer → conversational intelligence (future)
- EVA Platform → full SaaS system (future)

---

## Core System Files (DO NOT BREAK)

- src/server.js
- src/db.js
- src/salesBrain.js
- src/routes/messages.js
- src/routes/metrics.js
- src/lib/auth.js
- src/followupWorker.js
- src/validators.js
- src/connectors/whatsapp.js

---

## System Flow (Real)

Client  
→ /v1/messages/inbound  
→ authenticate()  
→ validateInbound()  
→ salesBrain.handleInbound()  
→ ensureConversation()  
→ save message  
→ detect intent + signals  
→ search catalog  
→ generate reply  
→ save assistant message  
→ update lead  
→ update memory  
→ update conversation  
→ create pipeline event  
→ create followup  
→ log execution  
→ response  

---

## CRM Model (IMPORTANT)

- leads → MAIN source of truth
- customer_profiles → memory layer
- conversations → interaction thread
- messages → history

---

## Module Responsibilities

### EVA Core
Handles:
- inbound
- validation
- execution
- persistence

---

### Sales Brain
Handles:
- intent detection
- stage detection
- lead scoring
- product matching
- response generation

---

### Followups
Handles:
- delayed actions
- reminders
- recovery of lost leads

---

### Analytics
Handles:
- metrics
- tracking
- performance signals

---

## Module Classification Rule

Every file MUST be classified as:

- CORE
- FUTURE
- EXPERIMENT
- LEGACY

---

## Future Modules (DO NOT DELETE)

- src/api/conversations.js
- src/api/leads.js
- src/api/intel.js
- src/api/metrics.js

These are reserved for dashboard and analytics.

---

## Current Status

### Completed
- inbound flow
- CRM base
- sales brain
- followups (basic)
- metrics (basic)

### Partial
- followups advanced
- metrics advanced
- API security

### Pending
- rate limiting
- advanced followups
- AI conversational layer
- dashboard UI

---

## Official Rules

1. Do NOT re-diagnose EVA from zero  
2. Do NOT assume system is broken  
3. Do NOT delete code without classification  
4. Always work in blocks  
5. Close a block before opening another  

---

## Final Statement

EVA is no longer in the phase of invention.

EVA is in the phase of:

→ stabilization  
→ execution  
→ scaling  
