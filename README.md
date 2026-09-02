# FZ ERP

Modern bilingual (English/Turkish) B2B ERP for orders, offers, customers, suppliers, products, invoices, payments, shipments, claims, currencies and reporting.

## Stack
Next.js App Router, TypeScript, PostgreSQL, Tailwind CSS, secure HttpOnly sessions, Zod-ready server validation.

## Security
Sessions use an HttpOnly cookie (`fz_session`). JWT secrets are mandatory in production. Database access is parameterized and resource names are allow-listed. Financial records support soft deletion and historical snapshots.

## Setup
1. Copy `.env.example` to `.env.local`.
2. Configure `DATABASE_URL` and a strong `JWT_SECRET`.
3. Apply `database/schema.sql` to PostgreSQL.
4. Run `npm install`, then `npm run typecheck`, `npm run build`, and `npm run dev`.

Never commit real secrets or production credentials.
