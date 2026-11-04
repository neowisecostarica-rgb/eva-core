-- EVA-MB-003A · READ-ONLY SCHEMA INVENTORY
-- Execute ONLY with read-only database credentials, in an approved maintenance session.
-- This does NOT prove tenant isolation; results must be reconciled with actual deployed schema.
BEGIN TRANSACTION READ ONLY;
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
AND (table_name ILIKE '%org%' OR table_name ILIKE '%member%'
OR table_name ILIKE '%user%' OR table_name IN
('leads','conversations','messages','pipeline_events','product_catalog','business_profile','prompt_config','followups'))
ORDER BY table_schema, table_name;
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
AND (table_name ILIKE '%org%' OR table_name ILIKE '%member%'
OR table_name ILIKE '%user%' OR table_name IN
('leads','conversations','messages','pipeline_events','product_catalog','business_profile','prompt_config','followups'))
ORDER BY table_schema, table_name, ordinal_position;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, policyname;
ROLLBACK;
