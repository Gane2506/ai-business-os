-- Disposable PostgreSQL only, after email_streams and before auth_foundation.
INSERT INTO "User" ("id", "clerkId", "encryptionKey", "updatedAt")
VALUES ('10000000-0000-4000-8000-000000000001', 'schema-fixture-user', 'fixture-encryption-material', now());
INSERT INTO "Organization" ("id", "clerkId", "name", "encryptionKey", "updatedAt")
VALUES ('20000000-0000-4000-8000-000000000001', 'schema-fixture-org', 'Schema fixture', 'fixture-org-material', now());
INSERT INTO "OrganizationMembership" ("id", "organizationId", "userId", "clerkUserId", "role", "extension", "updatedAt")
VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'schema-fixture-user', 'org:admin', '101', now()),
       ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', NULL, 'schema-fixture-invite', 'org:member', '102', now());
INSERT INTO "UserEmail" ("id", "userId", "email", "isPrimary", "status", "updatedAt")
VALUES ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'schema-primary@example.invalid', true, 'verified', now()),
       ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'schema-alias@example.invalid', false, 'pending', now()),
       ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'schema-unverified@example.invalid', false, 'unverified', now());
-- Snapshot existing SQL-only checks, indexes and triggers before the auth migration.
CREATE TABLE "_AuthSchemaBaselineCatalog" AS
SELECT 'index'::text AS kind, i.indexname::text AS name, i.indexdef::text AS definition
FROM pg_indexes i WHERE i.schemaname = current_schema()
UNION ALL
SELECT 'constraint', c.conrelid::regclass::text || '.' || c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = current_schema()
UNION ALL
SELECT 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema() AND NOT t.tgisinternal;
