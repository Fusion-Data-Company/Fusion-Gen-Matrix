-- Fusion Gen Matrix: initial PostgreSQL schema, reviewed before secure activation.
-- Run only through scripts/migrate-postgres.ts, which verifies an empty dedicated
-- database, takes an advisory lock and applies this file in ONE transaction.
-- JSONB retains the application document contract and all existing string IDs.
-- No credentials, roles, extensions, grants or existing tables are changed.
CREATE SCHEMA fusion_matrix;
CREATE TABLE fusion_matrix.schema_migrations (
  id text PRIMARY KEY,
  checksum text NOT NULL,
  application text NOT NULL CHECK (application = 'fusion-gen-matrix'),
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fusion_matrix.profiles (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT profiles_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.generations (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT generations_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.projects (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT projects_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.uploads (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT uploads_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.credit_ledger (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT credit_ledger_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.stripe_events (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT stripe_events_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.hf_webhook_events (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT hf_webhook_events_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.presets (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT presets_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.model_pricing (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT model_pricing_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.reports (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT reports_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.rate_limits (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT rate_limits_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);
CREATE TABLE fusion_matrix.preview_sessions (
  id text PRIMARY KEY CHECK (length(id) > 0),
  document jsonb NOT NULL,
  CONSTRAINT preview_sessions_identity CHECK (jsonb_typeof(document) = 'object' AND document ? 'id' AND jsonb_typeof(document->'id') = 'string' AND document->>'id' = id)
);

-- Application invariants and equivalents of the existing MongoDB unique indexes.
ALTER TABLE fusion_matrix.profiles ADD CONSTRAINT profiles_balances CHECK (
  document ?& ARRAY['subscriptionCredits', 'topupCredits'] AND
  jsonb_typeof(document->'subscriptionCredits') = 'number' AND
  jsonb_typeof(document->'topupCredits') = 'number' AND
  (document->>'subscriptionCredits')::numeric BETWEEN 0 AND 9007199254740991 AND
  (document->>'topupCredits')::numeric BETWEEN 0 AND 9007199254740991 AND
  trunc((document->>'subscriptionCredits')::numeric) = (document->>'subscriptionCredits')::numeric AND
  trunc((document->>'topupCredits')::numeric) = (document->>'topupCredits')::numeric
);
ALTER TABLE fusion_matrix.generations ADD CONSTRAINT generations_state CHECK (
  document ?& ARRAY['userId', 'status'] AND jsonb_typeof(document->'userId') = 'string' AND
  document->>'status' IN ('pending_submit', 'queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled')
);
ALTER TABLE fusion_matrix.credit_ledger ADD CONSTRAINT ledger_identity CHECK (
  document ?& ARRAY['userId', 'reason', 'refId', 'bucket'] AND
  jsonb_typeof(document->'userId') = 'string' AND jsonb_typeof(document->'reason') = 'string' AND
  jsonb_typeof(document->'refId') = 'string' AND document->>'bucket' IN ('subscription', 'topup')
);
CREATE UNIQUE INDEX profiles_stripe_customer ON fusion_matrix.profiles ((document #> '{stripeCustomerId}')) WHERE document ? 'stripeCustomerId';
CREATE UNIQUE INDEX generations_request_id ON fusion_matrix.generations ((document #> '{requestId}')) WHERE document ? 'requestId';
CREATE UNIQUE INDEX ledger_business_key ON fusion_matrix.credit_ledger ((document #> '{reason}'), (document #> '{refId}'), (document #> '{bucket}'));
CREATE INDEX generations_status_updated ON fusion_matrix.generations ((document #> '{status}'), (document #> '{updatedAt}'), (document #> '{id}'));
CREATE INDEX generations_public_published ON fusion_matrix.generations ((document #> '{isPublic}'), (document #> '{publishedAt}') DESC, (document #> '{id}') DESC);
CREATE INDEX generations_owner_created ON fusion_matrix.generations ((document #> '{userId}'), (document #> '{createdAt}') DESC, (document #> '{id}') DESC);
CREATE INDEX projects_owner_created ON fusion_matrix.projects ((document #> '{userId}'), (document #> '{createdAt}') DESC, (document #> '{id}') DESC);
CREATE INDEX uploads_owner_created ON fusion_matrix.uploads ((document #> '{userId}'), (document #> '{createdAt}') DESC, (document #> '{id}') DESC);
CREATE INDEX credit_ledger_owner_created ON fusion_matrix.credit_ledger ((document #> '{userId}'), (document #> '{createdAt}') DESC, (document #> '{id}') DESC);
CREATE INDEX stripe_events_pending ON fusion_matrix.stripe_events ((document #> '{payload,pending}'), (document #> '{createdAt}') DESC);
CREATE INDEX stripe_events_receipts ON fusion_matrix.stripe_events ((document #> '{type}'), (document #> '{payload,receiptSent}'), (document #> '{createdAt}') DESC);
CREATE INDEX rate_limits_expiry ON fusion_matrix.rate_limits ((document #> '{expiresAt}'));
CREATE INDEX preview_sessions_expiry ON fusion_matrix.preview_sessions ((document #> '{expiresAt}'));

-- Auth.js pg adapter uses these public table names. Text IDs preserve any future
-- approved MongoDB user-ID import; new users receive UUID strings.
CREATE TABLE public.users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text,
  email text NOT NULL UNIQUE,
  "emailVerified" timestamptz,
  image text
);
CREATE TABLE public.accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  "providerAccountId" text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  UNIQUE (provider, "providerAccountId")
);
CREATE INDEX accounts_user ON public.accounts ("userId");
CREATE TABLE public.sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);
CREATE INDEX sessions_user ON public.sessions ("userId");
CREATE INDEX sessions_expiry ON public.sessions (expires);
CREATE TABLE public.verification_token (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);
CREATE INDEX verification_token_expiry ON public.verification_token (expires);
