# EVA-MB-002 — EVA Core audit / candidate security gates
Fecha: 2026-11-03 · Estado: NO-GO multiempresa / cambios aislados sin deploy.

## Reconciliación
Backend encontrado: neowisecostarica-rgb/eva-core, main, Node/Express/PostgreSQL. Aplicación cliente: neowisecostarica-rgb/eva-sales-hub (PR #2 separado).

## Evidencia
- src/lib/auth.js compara una clave API compartida y asigna req.organization_id desde ORG_PRIMARY (entorno), ignorando la cabecera x-eva-org-id para autorización tenant. No hay identidad de usuario/membresía por tenant; sistema configurado como single-organization.
- src/api/leads.js, src/api/conversations.js, src/routes/products.js y src/routes/setup.js usan filtros organization_id en diversas consultas; esto ayuda, pero el tenant está fijado globalmente, no verificado por identidad del solicitante.
- src/routes/whatsappWebhook.js aceptaba POST sin verificar firma Meta y enviaba respuestas al canal. src/server.js iniciaba startFollowupWorker sin gate de activación.
- src/routes/messages.js deduplicaba external_message_id globalmente, sin organization_id. src/followupWorker.js consultaba mensajes por conversation_id sin organización.
- src/db.js y varios módulos usan datos existentes de base remota; no se inspeccionaron datos ni secretos.
- processNewMessage de Base44 usa la clave EVA Core, pero falta autenticación propia del invocador externo.

## Mitigaciones candidatas (solo rama)
1. Firma HMAC-SHA256 Meta sobre body bruto; sin WHATSAPP_APP_SECRET o firma válida, POST webhook se rechaza (fail-closed). GET challenge permanece. Requiere configurar secreto antes de un deploy: cuidado con disponibilidad.
2. Seguimientos automáticos OFF por defecto; requieren EVA_ENABLE_AUTOMATED_FOLLOWUPS=true. El despliegue sin esa variable cambia el comportamiento de seguimientos deliberadamente.
3. Aislamiento por organization_id en idempotencia de inbound y consulta de último mensaje de followups.
4. Minimización de logs de contenido entrante / respuestas y tokens de verificación.
5. Pruebas unitarias creadas (tests/eva-mb-002-meta-signature.test.js) pero todavía SIN ejecución verificada.

## P0 restantes
- Diseñar y probar autenticación de tenant real: identity/membership per organization y autorización server-side por recurso, con roles y separación de credenciales. No activar multiempresa hasta haberlo hecho.
- Verificar webhook contra firma real de Meta en entorno aislado y manejo de reintentos; persistir idempotencia por tenant con índice único y transacción.
- Restringir activación de canal/worker, consentimiento, quiet hours, opt-out, límites; no mensajes reales en QA.
- Probar dos tenants ficticios, tenant cruzado por ID, revocación, logs, scopes, API key y payloads maliciosos.
- Revisar rutas de envio manual y worker, integraciones con Base44 y los PR #1/#2.
- Ejecutar Node tests/CI y QA del candidato antes de merge; documentar impactos de fail-closed.

## Dictamen
NO-GO para beta multiempresa/autonomía y para merge. PR borrador sin deploy y sin tocar producción.

## Continuidad: reutilizar antes de crear (03/11, nueva revisión)
- Reutilizado `src/lib/auth.js` (ya existente), `req.organization_id` y SQL tenant-scoped de leads/conversations/products/setup. No se ha creado otro proveedor de autenticación.
- Revisado Base44: `User` y `PipelineEvent` son los únicos esquemas visibles; no existe evidencia de Membership persistida. No crear otra colección sin validar inventario SQL real.
- Corregida en candidato la comparación del secreto con `timingSafeEqual` y rechazo fail-closed si `x-eva-org-id` difiere de `ORG_PRIMARY`. Mantiene compatibilidad con la organización única actual y NO habilita multiempresa.
- Agregado `tests/eva-mb-002-service-identity.test.js` y workflow de CI dedicado; no se han ejecutado aquí ni confirmado resultados.
- Pendiente: contratos del proveedor de identidad, consulta real de tablas y membresías, roles server-side, dos organizaciones ficticias, QA de usuarios, consentimientos y despliegue controlado.
- Prioridad de implementación posterior: extender autenticación actual con membresía verificable por usuario/servicio, nunca confiar en organización indicada por el navegador.
