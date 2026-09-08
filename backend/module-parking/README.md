# module-parking

Bounded context of the parking-meter domain. Zones, tariffs, numbered spaces, vehicles, the
per-municipality policy, parking sessions, the per-tenant wallet and the minute credits are modelled;
patrols and citations are still deferred on purpose.

## Why it exists already

`docs/ARCHITECTURE.md` §1 lists Parking as a bounded context from v0.1 and §5 names it the module
most likely to be extracted into its own service. Creating the Maven module now makes the dependency
rule an enforced fact instead of a comment:

- `module-parking` → `platform-core`, `module-tenancy` (allowed)
- nothing → `module-parking` (no other module declares it as a dependency)

Adding a forbidden dependency later fails the build, which is exactly the guarantee the ADR asks for.

## Rules every table and endpoint here respects

They were written before the first slice existed and none of them was relaxed to get v0.2 done.

| Rule | Source |
|---|---|
| `tenant_id NOT NULL` + FK to `tenants(id)` on every owned table | docs/DATA_MODEL.md §3 |
| Money as `amount_minor bigint` + `currency_code char(3)`, `cr.luparx.core.money.Money` in code | ADR 0009 |
| No reads of `identity`/`tenancy` tables — only their ports, DTOs and outbox events | docs/ARCHITECTURE.md §5 |
| Idempotency keys on any endpoint that can charge money or create a session twice | ADR 0012 |
| Every write emits `audit_events`, and `outbox_events` when it crosses a boundary | CONTRACT.md §7 |

## Current state

| Migration | What it added |
|---|---|
| `V5_0` | `parking_zones`, `parking_rates` — the two tables that pinned the tenant-ownership and money conventions |
| `V10_0` | `parking_spaces`; a zone gained `description` and `division_id` |
| `V11_0` | The v0.2 domain: `vehicles`, `parking_policies`, `parking_sessions`, `parking_session_extensions`, `wallet_accounts`, `wallet_transactions`, `parking_time_credits`, `parking_time_credit_entries` |

The module owns eleven entities with their repositories and seven services. The REST surface lives in
`app` (`CitizenVehicleController`, `CitizenParkingController`, `CitizenWalletController`,
`AdminParkingController`); what is still a `501 NOT_IMPLEMENTED` stub is inspector patrols, citations
and municipal finance.

| Service | Responsibility |
|---|---|
| `VehicleService` | The citizen's cars. Normalises plates, keeps one primary, refuses to delete a car with a running session |
| `ParkingPolicyService` | Reads and replaces the municipality's policy; decides what a municipality without one offers, and is the only place that says `INVALID_INCREMENT` |
| `ParkingQuoteService` | The one place a parking amount is computed: tariff lookup and the credit-then-money rule |
| `ParkingSessionService` | Start, extend, finish; lazy expiry; the transaction that keeps charge and session together |
| `WalletService` | The citizen's money in one municipality. Row-locked charges; `INSUFFICIENT_BALANCE` |
| `TimeCreditService` | Minutes to the citizen's favour: lots, soonest-expiry-first consumption, lazy expiry sweep |
| `ParkingCatalogService` | What an administrator maintains: zones (deactivated, never deleted) and tariff windows (superseded, never edited) |

## The model, and why it is shaped this way

### A vehicle belongs to a person, not to a municipality

`vehicles` has no `tenant_id`. Users are global (CONTRACT.md §1) and the same car is driven to two
municipalities on the same day; what is per tenant is the session, the money and the minutes.

### A plate is unique per user, never globally

`UNIQUE (user_id, plate_normalized)`. Two different people registering the same plate is a legitimate
and expected case — a shared family car, a company car driven by several employees, a plate reused
after a transfer. A global unique index would lock the first registrant in and lock everyone else out,
so it must never be added.

The price of that decision is an ambiguity, and it is not hidden: a lookup by plate can match several
citizens. `ParkingSessionRepository.findByTenantIdAndPlateSnapshotAndStatusOrderByExpiresAtAsc`
returns **every** active match in the municipality and carries a `TODO(domain)` recording that
disambiguating them — by the zone and bay already on each row, or by asking the inspector which bay
the car is standing on — is an open **product** decision. Returning the first match would let a real
infraction be excused by somebody else's session, so nothing is chosen in code.

### The session keeps a copy of the plate

`plate_snapshot` is the normalised plate as it was when the session started. The inspector verifies
against what was painted on the car at that moment; a citizen correcting a typo afterwards must not
rewrite history.

### The two invariants live in the schema

`uq_parking_sessions_active_space` and `uq_parking_sessions_active_vehicle` are partial unique indexes
over `status = 'ACTIVE'`. "One session per bay" and "one session per vehicle" therefore hold with any
number of backend instances, and two replicas racing on the same bay resolve it in the database rather
than in application memory. A citizen may still have several sessions at once — one per vehicle.

A session past the municipality's `grace_minutes` is moved to `EXPIRED` **lazily**, the next time
anybody looks at that bay or that vehicle. No scheduler, idempotent, correct with any number of
instances — and without it the partial index would hold a bay for a session nobody is paying for.

### Money is charged, minutes are credited

Finishing early never returns money (CONTRACT.md v0.2, rule 5). If the policy allows it, the remaining
minutes become a **lot** of credit with its own expiry. Lots exist rather than one pooled number
because minutes expire: consuming soonest-expiry-first is the only rule that does not quietly destroy
value, and an expiry applied to an undifferentiated pool would be impossible to explain to the citizen
it took minutes from.

Credit is consumed **first** and only the rest is charged, and the rest is *priced on its own* rather
than discounted from the full price: with an hourly tariff, 90 minutes of which 30 are credited is one
paid hour, not one and a half. Pricing what is actually being bought is the only rule that cannot
overcharge.

Charge and session are written in one transaction. `INSUFFICIENT_BALANCE` leaves no session, no spent
minutes and no debit.

### The policy is data, and so are the increments

`parking_policies` has one row per tenant, with the tenant as its primary key — so there is no way to
spell a query in `ParkingPolicyRepository` that is not tenant-scoped. The two increment lists are
stored as a canonical comma-separated string (`"30,60,120"`) and read only through
`MinuteIncrements`: the value is read as a whole and never queried by element, and a CHECK constraint
can state the whole format. If per-increment metadata is ever needed, it becomes a child table then,
through an expand-and-contract migration.

A municipality that has not configured a policy gets one materialised from
`platform.defaults.parking.*` on the first read. Nothing in this module carries a default of its own.

### Locking

Two row locks are taken on the way through a session write — the minute balance first, the wallet
second, always in that order, always inside one short transaction. A fixed order is what makes a
deadlock between two citizens' concurrent requests impossible. Pessimistic rather than optimistic on
purpose: two concurrent charges under optimistic locking would both read the same balance, both find
it sufficient, and one would fail at commit with a conflict the citizen sees as an error even though
their money was there.

## Decisions worth not re-litigating

**A space code is text.** `parking_spaces.code` is what is painted on the bay and what the citizen
types: `0001`, `A12`, `B-125`, `LUP-0001`. An integer column would turn `0001` into `1` and stop
matching the sign on the street. It is unique per tenant, never globally — two municipalities both
numbering from `0001` is the normal case.

**`division_id` is a database foreign key, not a Java association.** This module has no Maven
dependency on `module-geo` and must not grow one; the reference lives in the schema while the
boundary lives in the build, exactly as `module-tenancy` already does with users.

**A plate is unique per user, never globally.** See the model section above: two people registering
the same plate is legitimate, so `UNIQUE (user_id, plate_normalized)` is the constraint and the
resulting lookup ambiguity is an open product decision, not a bug to patch in a repository.

**Minutes are not money.** They are earned by finishing early, spent first on the next session in the
same municipality, they expire, and they never become a wallet balance. There is deliberately no code
path that converts one into the other.
