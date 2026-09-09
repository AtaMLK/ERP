# GIB readiness

The ERP is prepared for a future Turkish GIB e-Fatura / e-Arşiv integration, but **GIB is not enabled and no GIB endpoint is called by the application**.

## Architecture

ERP invoice business logic should remain independent from GIB. When integration is approved, an authorized private integrator can be connected behind the `GibProvider` interface in `src/lib/integrations/gib/types.ts`.

```text
ERP invoice
    |
    v
GIB adapter interface
    |
    +--> future authorized private integrator
    |
    +--> future test/mock provider
```

## Deliberately not implemented yet

- No GIB URL or SOAP/API endpoint is called.
- No GIB credentials, certificate, mali mühür, token, or secret is stored.
- No invoice is automatically submitted to GIB.
- No production integrator dependency is installed.
- Existing invoice workflows remain independent of GIB.

## Future implementation boundary

When the business decision is made, the implementation should add a provider adapter that handles:

1. UBL-TR invoice generation/validation.
2. e-Fatura and e-Arşiv document selection.
3. Submission to the selected authorized private integrator.
4. Provider/GIB response and status synchronization.
5. UUID/provider identifiers and immutable submission history.
6. XML/PDF archival and audit logging.
7. Cancellation/credit workflows according to the selected provider's supported process.

The provider should be replaceable without changing order, invoice, payment, or reporting business logic.
