# GIB integration boundary

GIB is intentionally **disabled** in the ERP at this stage.

This directory contains only provider-neutral contracts and documentation. It must not make network requests or require GIB credentials.

## Future scope

When a Turkish e-Fatura/e-Arşiv provider is selected, implement `GibProvider` in a separate provider adapter. The ERP should pass normalized invoice data to the adapter and receive a normalized result.

Expected future capabilities:

- e-Fatura and e-Arşiv document creation
- UBL-TR XML generation/validation
- UUID and provider document ID tracking
- send/accept/reject status polling
- cancellation where supported
- PDF/XML archival and document hashes
- provider request/response audit events
- retry and idempotency

## Security

Do not store GIB certificate/private-key material in source control. Provider credentials must be supplied through deployment secrets. Keep provider-specific code isolated from invoice/order business logic.

## Current state

There is no active provider, no GIB endpoint, no credential and no automatic submission. Adding these files does not change current invoice behavior.
