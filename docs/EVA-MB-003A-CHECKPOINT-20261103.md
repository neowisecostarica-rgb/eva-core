# EVA-MB-003A — Fundación multiempresa · Dictamen técnico
Fecha: 2026-11-03 · Tipo: megabloque integral · Estado: BLOQUEADO para runtime multiempresa, código candidato en revisión.
Dependencia: PR #1 de EVA Core (security/eva-mb-002-core-gates-20261103). No merge, no deploy, no escrituras DB.

## Inventario previo: reutilizar antes de crear
- Base44 EVA Sales Hub `69a83c8fe792fb312f1d1945`: solo entidades `User` (roles `admin|user`) y `PipelineEvent`; no entidades de empresas ni membresía visibles. La autenticación `base44.auth.me()` existe, pero el proxy usa `EVA_ORG_ID` global.
- EVA Core PostgreSQL: `organization_id` ya utilizado en `leads`, `conversations`, `messages`, `product_catalog`, `business_profile`, `prompt_config`, `followups`, `pipeline_events`. Las consultas comerciales existentes aplican filtros por organización, pero las garantías SQL y RLS no están verificadas.
- EVA Core `src/lib/auth.js` del PR previo conserva `ORG_PRIMARY` fijo y clave compartida. Puede operar solo como identidad de servicio para una organización, NO como autorización multiempresa de usuarios.
- El acceso autorizado a esquema PostgreSQL no está disponible desde los conectores de este contexto. No se ha confirmado si existen tablas `organizations` o `memberships`; prohibido crear tablas homónimas sin inventario.
- La ruta `businessProfile` de main estaba expuesta; el PR previo tiene corrección aislada + CI PASS en candidato. Sigue sin desplegar.

## Código realizado en esta rama
1. `src/lib/tenantAuthorization.js`: política pura para membresías activas y roles `SUPER_ADMIN`, `ORG_ADMIN`, `SALES_MANAGER`, `SALES_AGENT`, `VIEWER`. Rechaza identidades y permisos desconocidos; la política NO permite acceso automático del superadmin a datos de un cliente; fallo de storage => denegación.
2. `tests/eva-mb-003a-tenant-authorization.test.js`: dos tenants ficticios, acceso cruzado, revocación, escalada de roles, servicio de membresías caído.
3. `src/db.js`: inserción de mensajes condicionada a la pertenencia de la conversación a la misma organización en la propia sentencia `INSERT ... SELECT`; si no hay conversación autorizada, error.
4. `sql/eva-mb-003a-inventory-readonly.sql`: inventario de tablas, columnas y RLS. **Nunca ejecutado contra producción**.
5. Workflow de seguridad ampliado para probar reglas puras y sintaxis de modificaciones. No asume que hay PostgreSQL, credenciales o migrations disponibles.

## Qué NO se hizo (obligatorio para dar GO)
- No se creó ni modificó ninguna tabla, organización, usuario o registro real.
- No se conectó la política de membresías a endpoints productivos porque no hay persistencia/identidad de usuario verificadas.
- No se realizaron tests E2E en PostgreSQL real ni a través de APIs reales con dos tenants; pruebas de dos organizaciones son fixtures unitarias.
- No se activó la posibilidad de elegir tenant con un header, por ser insegura sin validación de memberships.
- No se integraron/mergearon PRs previos ni se ejecutó un deploy; no se activaron comunicaciones.

## Gate de aceptación (BLOQUEADO)
A. Revisar salida de `sql/eva-mb-003a-inventory-readonly.sql` con credenciales read-only autorizadas y contar organizaciones, memberships y RLS existentes, SIN exponer datos personales.
B. Crear/adaptar persistencia **solo si no existe**, con unicidad (org, user), roles y estado, migración reversible y sin tocar organizaciones existentes.
C. Autenticar el usuario del lado servidor con identidad verificable Base44 u otro proveedor, correlacionar miembros en DB y exigir permisos a CADA endpoint, procesamiento de mensajes, worker y servicios.
D. Probar que tenant A no lee/modifica tenant B con IDs reales simulados en una base aislada, incluidos eventos, adjuntos, producto, propuesta, métricas, webhook, datos y logs.
E. QA de Base44, Core, webhook Meta firmado y worker OFF, pruebas de regresión y dictamen. Menús QR NO se registra en DB hasta GO.
F. Ejecutar pruebas Node/CI sobre SHA exacto; ningún PASS puede atribuirse sin informe de ejecución.

## Decisión
**Megabloque cerrado en entrega técnica como BLOQUEADO para lanzamiento multiempresa.** Se han entregado componentes y pruebas candidatos en PR borrador. La activación requiere cumplir A-F. No abrir otro megabloque en lugar de resolver estos bloqueos; mantener MB-003A como gate hasta verificarlo.

## QA y evidencia final — 2026-11-03
- GitHub Actions run `41764236798` sobre SHA `dabcdd5f6790625f631cc244d8259ea66b137efe`: `security-unit` completed/success.
- Etapas de CI verificadas: `Run isolated security contract tests` PASS; `Check syntax without connecting to services` PASS. Se ejecutaron fixtures con tenants ficticios en `tests/eva-mb-003a-tenant-authorization.test.js`.
- QA runtime/DB (dos empresas reales de prueba, membresía persistida, acceso por API Base44): **NO VERIFICADO / BLOQUEADO** por falta de esquema PostgreSQL y credenciales de lectura autorizadas.
- No se hizo merge ni deploy. Dictamen global **BLOQUEADO**, aunque CI aislado PASS.

## Continuación 2026-11-03: verificación de PostgreSQL aislado
- Se buscó conector de PostgreSQL / Render / Neon / Supabase en las herramientas disponibles: ninguno expone la base EVA Core. No se encontró autorización para leer el esquema productivo. **Inventario real sigue BLOQUEADO**.
- Se reutilizó la sentencia `INSERT INTO messages ... SELECT ... FROM conversations WHERE organization_id=$1` ya implementada en esta rama; no se creó tabla ni servicio en producción.
- Archivo `tests/eva-mb-003a-postgres-isolation.test.js`: extrae la sentencia SQL literal de `src/db.js` y la ejecuta contra PostgreSQL 16 efímero. Crea tablas TEMP y dos organizaciones ficticias dentro de una transacción revertida; comprueba inserciones tenant A/B y denegación de operación cross-tenant (rowCount=0).
- Nuevo workflow `.github/workflows/eva-mb-003a-postgres.yml` en GitHub Actions con PostgreSQL 16 descartable, conexión restringida a localhost y sin credenciales de producción. **PASS confirmado** en run `41765058375`, job `postgres-isolation` sobre commit `a26dc6201b3fc37334a2a72fb121a3b791822f25`.
- La ampliación del test `eva-mb-003a-postgres-isolation.test.js` coincidió con el patrón amplio anterior de CI unitario; run `41765058265` tuvo FAIL por ejecutar integración sin base. El workflow unitario se corrigió separando explícitamente suites con commit `990dda728331654e251f6cc081470e2ad03f8cee`. No atribuir PASS al SHA actualizado hasta confirmar sus ejecuciones.
- **Dictamen:** PASS limitado de SQL contra PostgreSQL efímero; BLOQUEADO para validar membresías y aislamiento API multiempresa real. No hay merge, deploy, cambios en datos, creación de tenants ni activación de ventas.

### Resultados de CI posteriores a la separación de suites
- Sobre commit `990dda728331654e251f6cc081470e2ad03f8cee`: run `41765107373` security-unit **completed/success**, pruebas unitarias y sintaxis PASS.
- Sobre el mismo commit: run `41765107516` postgres-isolation **completed/success**, PostgreSQL temporal e inserciones tenant-scoped PASS.
- Estos dos PASS no demuestran pertenencia de usuario/membresía a tenant ni RLS real, porque usan fixtures; no habilitan merge, publicación o alta real de Menús QR.

## Verificación directa de Render — 2026-11-03
- Render fue conectado y consultado con `list_workspaces`. Único workspace accesible: `Gustavo's workspace`, ID `tea-d6tc7gfgi27c73djdnv0`.
- `list_postgres_instances` para ese workspace: `No Postgres instances found`.
- `list_services` para ese mismo workspace: respuesta `null` (no es evidencia concluyente de ausencia de EVA Core).
- **No se ha localizado la instancia real de PostgreSQL** ni el servicio EVA Core en la cuenta accesible. Esto no prueba que no existan en otra cuenta, workspace o proveedor.
- No se ejecutó `query_render_postgres` por no contar con `postgresId` verificado. No se imprimieron secretos ni se consultaron datos personales.
- Accionamiento requerido: localizar en panel de Render el workspace/servicio efectivamente asociado a EVA Core, o conectar la cuenta correcta; entonces ejecutar el inventario solo lectura ya preparado y retomar gate de membresías.
- Estado MB-003A sigue **BLOQUEADO / NO-GO**. No crear nueva PostgreSQL ni cambiar DATABASE_URL por este hallazgo; no merge/deploy, no alta Menús QR.

## Evidencia de infraestructura aportada por usuario — 2026-11-03
- Captura de dashboard Render en el workspace **Neo Wise's workspace**, proyecto **Evangelina**, entorno **Production**.
- Se observan dos recursos: `eva-core` (Node) y `eva-db` (PostgreSQL 18), ambos en Oregon y ambos con estado **Suspended by Render**.
- Banner visible: **Workspace suspended — Render has suspended your services due to non-payment**. No se verificó importe de factura ni estado de pagos, ni se intentó reactivar servicios.
- El conector de Render previamente vinculado a `Gustavo's workspace` corresponde a un workspace diferente; su inventario vacío no significa que los recursos de EVA no existan.
- **Bloqueo inmediato:** acceso autorizado al workspace correcto y regularización/confirmación de las condiciones de suspensión antes de cualquier consulta al esquema; no crear otra base, no cambiar DATABASE_URL, no realizar deploy o migraciones.
- La captura acredita existencia visible y suspensión; no acredita disponibilidad de consultas SQL, integridad de datos, backups ni posibilidad de recuperación. MB-003A sigue BLOQUEADO para integración y alta real de Menús QR.
