# module-parking (stub)

Frontier module for the parking-meter domain. **No production code yet on purpose.**

## Why it exists already

`docs/ARCHITECTURE.md` §1 lists Parking as a bounded context from v0.1 and §5 names it the module
most likely to be extracted into its own service. Creating the Maven module now makes the dependency
rule an enforced fact instead of a comment:

- `module-parking` → `platform-core`, `module-tenancy` (allowed)
- nothing → `module-parking` (no other module declares it as a dependency)

Adding a forbidden dependency later fails the build, which is exactly the guarantee the ADR asks for.

## What the first real slice must respect

| Rule | Source |
|---|---|
| `tenant_id NOT NULL` + FK to `tenants(id)` on every owned table | docs/DATA_MODEL.md §3 |
| Money as `amount_minor bigint` + `currency_code char(3)`, `cr.luparx.core.money.Money` in code | ADR 0009 |
| No reads of `identity`/`tenancy` tables — only their ports, DTOs and outbox events | docs/ARCHITECTURE.md §5 |
| Idempotency keys on any endpoint that can charge money or create a session twice | ADR 0012 |
| Every write emits `audit_events`, and `outbox_events` when it crosses a boundary | CONTRACT.md §7 |

## Current state

- `V5_0__parking_stub.sql` creates `parking_zones` and `parking_rates` as the two seed tables that
  demonstrate the tenant-ownership and money conventions. They are intentionally minimal.
- The REST paths reserved in CONTRACT.md §4 are published by `app` and answer
  `501 Not Implemented` with the RFC 9457 code `NOT_IMPLEMENTED`, so the contract surface is
  discoverable in OpenAPI and no client accidentally believes the feature exists.
