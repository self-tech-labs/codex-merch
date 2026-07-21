# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability, exposed secret,
payment problem, provider mutation, or customer-data concern. Email
`elliot@ritsl.com` with:

- a concise description and affected route, command, or file;
- reproduction steps that do not create a real payment or order;
- the potential impact; and
- a safe way to contact you.

Do not include credentials, raw private X content, customer addresses, or full
production logs. You should receive an acknowledgment within five business days.

## Supported version

Security fixes target the current default branch. Build Week Preview branches
are non-commerce demonstrations and may be retired after judging.

## Security boundaries

- Preview mode rejects checkout on the server, even if client controls are
  bypassed.
- Product prices and variant readiness are resolved server-side.
- Stripe webhooks require signature verification before order state changes.
- Printful operations are explicit, idempotent, and keep auto-confirm disabled
  during the pilot.
- Raw signal content and local run ledgers are excluded from public artifacts.
- Secrets belong in ignored local or deployment environment files, never Git.

See [`docs/production-deployment.md`](docs/production-deployment.md) for the
full production configuration and [`docs/production-runbook.md`](docs/production-runbook.md)
for incident, reconciliation, and rollback procedures.
