# Fusion Gen Matrix identity and billing

The app separates three modes. Demo is an explicitly local preview on loopback. Showcase is public and read-only, with no authenticated user. Live uses Auth.js v5 database sessions and the selected MongoDB or Postgres repository; missing live configuration fails closed.

## Identity

The default Neon configuration uses `DATABASE_PROVIDER=postgres` and the official pg adapter with atomic-update and expiry overrides on the shared pool. Explicit legacy MongoDB configuration uses its official Auth.js adapter and cached MongoClient. Adapter users, sessions and verification tokens remain separate from application profiles and balances, keyed by the same user ID. Postgres stores IDs as text, preserving existing identifiers; see [database setup and migration](postgres.md). Session responses contain only user ID and role plus session expiry. Every privileged API reloads the application profile. ADMIN_EMAILS is a comma-separated deployment allowlist and is checked server-side.

Magic links expire after 10 minutes and use a branded React Email template with HTML, text and a fallback URL. The handler limits requests by network bucket and normalized email. Only explicitly trusted reverse proxies can supply an IP header; deployments using another trusted proxy must set TRUST_PROXY=true. With no trusted proxy, the shared direct-network bucket is intentionally conservative.

The local preview has a random 256-bit HttpOnly, SameSite=Strict session cookie. Storage contains only its SHA-256 hash. Sessions expire after 12 hours and logout removes the stored session. A fresh preview account receives 200 clearly local credits once. operator@preview.local is the sole preview administrator. Loopback host and same-origin checks protect preview login. Showcase never instantiates live auth or permits preview login.

## Billing activation

Billing requires APP_MODE=live, BILLING_PRICES_CONFIRMED=true, a server Stripe key, and the requested configured price ID. A live-mode key also requires ENABLE_LIVE_BILLING=true. No prices, products, customers, checkouts, API keys, charges or emails were created during implementation. Displayed commercial amounts remain unconfigured until final prices are supplied.

The server chooses products from STRIPE_PRICE_STARTER_MONTHLY / ANNUAL, PLUS, ULTRA and TOPUP_SMALL / MEDIUM / LARGE. It ignores client-supplied prices and amounts. A customer is created lazily at first checkout with an idempotency key. Existing subscribers use the customer portal for changes and cancellation. Profile ownership determines the customer; client customer IDs are never accepted.

The webhook verifies Stripe's signature against the bounded raw body, checks test/live mode, and saves a pending event before returning 2xx. Next after() retrieves canonical Stripe objects and applies it; the protected reconciler calls retryStripeEvents() for durable failures. Only event ID/type are queued, not raw payment details. Checkout credits require paid status, one configured line item, quantity one, the studio metadata marker, and matching customer and profile identity. Both checkout.session.completed and checkout.session.async_payment_succeeded are supported. An unpaid completed event grants nothing.

Ledger changes and the processed-event marker commit in one database transaction. Checkout session IDs and invoice IDs are separate deduplication boundaries, so distinct event IDs for one purchase cannot double-credit. Receipts have durable purchase records and Resend idempotency keys. The protected reconciler calls retryCreditReceipts() to retry email failures without granting more credits. Resend idempotency has its own provider retention window, so an interrupted send/acknowledgement can eventually produce a duplicate receipt; credit accounting remains idempotent.

Paid invoices reset the subscription bucket and preserve nonexpiring top-ups. Annual paid terms are divided into monthly allowance resets by reconcileBilling(); it does not charge Stripe. Month-end anchors are preserved. A canceled paid term retains credits until its end, then the subscription bucket expires. Delayed older invoices cannot reset a newer term. Concurrent overlapping subscriptions are flagged for operator review and do not grant a second allowance.

Refund handling uses the cumulative refunded amount and proportionally claws back top-up credits, never below zero. The account is flagged for review, with any already-spent credit shortfall recorded. A refund delivered before the purchase webhook is handled in the same grant/refund transaction. No automatic cash refund is initiated by this app.

## Operations

1. Configure the live environment, verify MongoDB indexes or the approved Postgres migration, and connect a verified Resend sending domain.
2. Configure reviewed Stripe prices and the customer portal in the intended test account. Do not enable live billing merely because an unrelated Stripe key exists in the environment.
3. Forward Stripe test webhooks to /api/webhooks/stripe and verify subscription, top-up, asynchronous payment, refund and replay cases in a real test account.
4. Schedule the protected reconciler. It must invoke retryStripeEvents(), reconcileBilling() and retryCreditReceipts(); in Postgres mode it also performs bounded expiry cleanup. Reconciliation currently scans at most 5,000 term records per run; add cursor pagination before exceeding that account scale.
5. Test magic-link delivery, expiry, logout and session revocation on the final public URL.

Automated tests exercise preview sessions, role boundaries, cross-origin rejection, rate-limit concurrency, repeated top-ups, customer mismatch, concurrent event replay, subscription reset, annual month-end renewal, partial and full refunds, refund ordering and cancellation expiry. The Postgres suite also verifies real local SQL transactions, Auth.js session/token handling and concurrent credit/event idempotency in an isolated cluster. Remote database connectivity, real email delivery, Stripe test checkout and the customer portal require external acceptance and were not exercised by these local tests.

## Primary references

- [Auth.js MongoDB adapter](https://authjs.dev/getting-started/adapters/mongodb)
- [Auth.js Resend provider](https://authjs.dev/getting-started/providers/resend)
- [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe webhook signatures and retries](https://docs.stripe.com/webhooks)
- [Current Invoice object](https://docs.stripe.com/api/invoices/object)
- [Current Subscription object](https://docs.stripe.com/api/subscriptions/object)

The installed Stripe SDK types identify API version 2026-09-30.endive. Invoice subscriptions are read from parent.subscription_details and item periods from subscription items, rather than older deprecated top-level fields.
