# module-parking

Bounded context of the parking-meter domain. Zones, tariffs and numbered spaces are modelled;
sessions, patrols, citations and finance are still deferred on purpose.

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
- `V10_0__parking_spaces.sql` adds `parking_spaces` and gives a zone a `description` and a
  `division_id`. The module now owns three entities and their repositories — `ParkingZone`,
  `ParkingRate`, `ParkingSpace` — read only by the `dev` fixture so far. No service, no controller.

## Two decisions worth not re-litigating

**A space code is text.** `parking_spaces.code` is what is painted on the bay and what the citizen
types: `0001`, `A12`, `B-125`, `LUP-0001`. An integer column would turn `0001` into `1` and stop
matching the sign on the street. It is unique per tenant, never globally — two municipalities both
numbering from `0001` is the normal case.

**`division_id` is a database foreign key, not a Java association.** This module has no Maven
dependency on `module-geo` and must not grow one; the reference lives in the schema while the
boundary lives in the build, exactly as `module-tenancy` already does with users.
