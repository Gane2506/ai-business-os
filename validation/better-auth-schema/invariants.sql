-- Disposable PostgreSQL only. Fixtures must precede the auth migration.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', reason; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(command text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF actual_state <> expected_state THEN RAISE EXCEPTION 'Expected %, got %: %', expected_state, actual_state, command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected failure %, command succeeded: %', expected_state, command;
END $$;
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT kind, name, definition FROM "_AuthSchemaBaselineCatalog"
  EXCEPT (
    SELECT 'index', i.indexname::text, i.indexdef::text FROM pg_indexes i WHERE i.schemaname = current_schema()
    UNION ALL
    SELECT 'constraint', c.conrelid::regclass::text || '.' || c.conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = current_schema()
    UNION ALL
    SELECT 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, pg_get_triggerdef(t.oid)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND NOT t.tgisinternal
  )
), 'Every pre-auth constraint, index and trigger definition must survive');
SELECT pg_temp.assert_true(
  (SELECT "clerkId" = 'schema-fixture-user' AND "encryptionKey" = 'fixture-encryption-material'
    AND "authEmail" IS NULL AND "authName" IS NULL AND NOT "authEmailVerified"
   FROM "User" WHERE id = '10000000-0000-4000-8000-000000000001'),
  'Existing User UUID and metadata must survive without automatic enrollment');
SELECT pg_temp.assert_true(
  (SELECT "clerkId" = 'schema-fixture-org' AND "encryptionKey" = 'fixture-org-material'
   FROM "Organization" WHERE id = '20000000-0000-4000-8000-000000000001'),
  'Existing organization identity must survive');
SELECT pg_temp.assert_true(
  (SELECT role = 'org:admin' AND extension = '101' AND "userId" = '10000000-0000-4000-8000-000000000001'
   FROM "OrganizationMembership" WHERE id = '30000000-0000-4000-8000-000000000001'),
  'Membership UUID, ownership, role and extension must survive');
SELECT pg_temp.assert_true(
  (SELECT "userId" IS NULL AND "clerkUserId" = 'schema-fixture-invite' AND role = 'org:member'
   FROM "OrganizationMembership" WHERE id = '30000000-0000-4000-8000-000000000002'),
  'Unresolved legacy invitation must remain unresolved');
SELECT pg_temp.assert_true(
  (SELECT array_agg(status::text ORDER BY email) = ARRAY['pending','verified','unverified']
   FROM "UserEmail" WHERE "userId" = '10000000-0000-4000-8000-000000000001'),
  'Email aliases and all verification states must survive');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'AuthSession' AND column_name = 'token'),
  'No raw bearer-token column');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 7 FROM information_schema.tables WHERE table_schema = current_schema()
   AND table_name IN ('EmailDomain','EmailIdentity','EmailPreference','EmailSuppression','EmailDelivery','EmailEvent','EmailUnsubscribeToken')),
  'All SES tables retained');
SELECT pg_temp.expect_error($q$UPDATE "User" SET "authEmailVerified" = true WHERE id = '10000000-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect_error($q$UPDATE "User" SET "authEmail" = ' UPPER@example.invalid ', "authName" = 'Name' WHERE id = '10000000-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect_error($q$UPDATE "OrganizationMembership" SET extension = '101' WHERE id = '30000000-0000-4000-8000-000000000002'$q$, '23505');
SELECT pg_temp.expect_error($q$UPDATE "OrganizationMembership" SET "userId" = '10000000-0000-4000-8000-000000000001' WHERE id = '30000000-0000-4000-8000-000000000002'$q$, '23505');
SELECT pg_temp.expect_error($q$UPDATE "OrganizationMembership" SET "clerkUserId" = 'schema-fixture-user' WHERE id = '30000000-0000-4000-8000-000000000002'$q$, '23505');

INSERT INTO "Organization" (id, name, "updatedAt") VALUES ('20000000-0000-4000-8000-000000000002', 'New organization without Clerk', now());
INSERT INTO "Organization" (id, name, "updatedAt") VALUES ('20000000-0000-4000-8000-000000000003', 'Second organization without Clerk', now());
SELECT pg_temp.expect_error($q$UPDATE "Organization" SET "clerkId" = 'schema-fixture-org' WHERE id = '20000000-0000-4000-8000-000000000002'$q$, '23505');
UPDATE "User" SET "authEmail" = 'schema-primary@example.invalid', "authName" = 'Schema User'
WHERE id = '10000000-0000-4000-8000-000000000001';
INSERT INTO "User" (id, "updatedAt") VALUES ('10000000-0000-4000-8000-000000000002', now());
SELECT pg_temp.expect_error($q$UPDATE "User" SET "authEmail" = 'schema-primary@example.invalid', "authName" = 'Duplicate' WHERE id = '10000000-0000-4000-8000-000000000002'$q$, '23505');
INSERT INTO "AuthSession" (id, "userId", "tokenHash", "expiresAt", "updatedAt", "activeOrganizationId")
VALUES ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'h1.' || repeat('a',64), now() + interval '1 hour', now(), '20000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error($q$UPDATE "AuthSession" SET "tokenHash" = 'raw-bearer-fixture' WHERE id = '50000000-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect_error($q$UPDATE "AuthSession" SET "userId" = '10000000-0000-4000-8000-000000000099' WHERE id = '50000000-0000-4000-8000-000000000001'$q$, '23503');
SELECT pg_temp.expect_error($q$UPDATE "AuthSession" SET "activeOrganizationId" = '20000000-0000-4000-8000-000000000099' WHERE id = '50000000-0000-4000-8000-000000000001'$q$, '23503');
SELECT pg_temp.expect_error($q$INSERT INTO "AuthSession" (id, "userId", "tokenHash", "expiresAt", "updatedAt") VALUES ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'h1.' || repeat('a',64), now(), now())$q$, '23505');
INSERT INTO "AuthAccount" (id, "userId", "providerId", "accountId", "updatedAt") VALUES
('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'credential', 'schema-account', now());
SELECT pg_temp.expect_error($q$INSERT INTO "AuthAccount" (id, "userId", "providerId", "accountId", "updatedAt") VALUES ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'credential', 'schema-account', now())$q$, '23505');
DELETE FROM "Organization" WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM "AuthSession" WHERE id = '50000000-0000-4000-8000-000000000001'), 'Deleting selected org must revoke session, never silently select personal');
ROLLBACK;
