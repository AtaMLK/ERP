# FZ ERP

Modern bilingual (English/Turkish) B2B ERP for orders, offers, customers, suppliers, products, invoices, payments, shipments, claims, currencies and reporting.

## Stack
Next.js App Router, TypeScript, PostgreSQL, Tailwind CSS, secure HttpOnly sessions, parameterized SQL and server-side permission checks.

## Security
Sessions use an HttpOnly `fz_session` cookie. JWT secrets are mandatory. Database access is parameterized and API resources are allow-listed. Transactional records use controlled status transitions, soft deletion where appropriate, audit logging and historical price/document snapshots.

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Configure `DATABASE_URL`, `DATABASE_SSL` and a strong `JWT_SECRET`.
3. Run `npm install`.
4. Apply the database with `npm run db:setup`.
5. Create the first administrator with `npm run create-admin`.
6. Run `npm run typecheck`.
7. Start the application with `npm run dev` and open `http://localhost:3000`.

`db:setup` safely applies both `database/schema.sql` and `database/constraints.sql`, so it can be run again when the database needs to be initialized or refreshed.

Never commit `.env.local`, passwords, JWT secrets, SMTP credentials or production database credentials.
