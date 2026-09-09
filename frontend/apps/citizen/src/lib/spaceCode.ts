import type { ParkingSpaceFormat, ParkingZone } from '@luparx/api-client';

/**
 * Client-side checks for the bay code typed in the parking flow.
 *
 * The server is still the authority — `POST /citizen/parking/sessions` is what decides whether a
 * bay exists, and its refusal is final. What this module buys is the *first* hint rather than the
 * last: typing `1500` in a zone that runs 0001–0050 should be answered next to the field, before a
 * round trip, instead of as a red banner at the top of the screen after one.
 *
 * Two independent rules, in the order a person would apply them:
 *
 *  1. **Shape** — the municipality's own `pattern` (`^[0-9]{4}$` in San José, `^E-[0-9]{4}$` in
 *     Escazú). Server-owned; never rebuilt here from `prefix`/`digits`.
 *  2. **Range** — the zone's published `spaceCodes` summary, when it has one.
 *
 * Both degrade to "no opinion" rather than to a false refusal: an unparseable pattern, a zone with
 * no published range, or codes this module cannot order all mean *let the server answer*. A client
 * check that blocks a code the server would have accepted is worse than no check at all.
 */

export type SpaceCodeProblem =
  | { kind: 'format'; example: string }
  | { kind: 'range'; first: string; last: string };

/** `E-0042` → `{ prefix: 'E-', digits: '0042', value: 42 }`; `null` when the code has no trailing digits. */
interface ParsedCode {
  prefix: string;
  value: number;
}

function parseCode(code: string): ParsedCode | null {
  const match = /^(.*?)(\d+)$/.exec(code);
  if (!match) return null;
  const value = Number(match[2]);
  return Number.isSafeInteger(value) ? { prefix: match[1]!, value } : null;
}

function matchesFormat(code: string, format: ParkingSpaceFormat | undefined): boolean {
  if (!format?.pattern) return true;
  try {
    return new RegExp(format.pattern).test(code);
  } catch {
    // A pattern this browser's engine cannot compile is not the citizen's problem: fall through to
    // the server, which compiled it fine.
    return true;
  }
}

function isInsideRange(code: string, first: string, last: string): boolean | null {
  const parsed = parseCode(code);
  const low = parseCode(first);
  const high = parseCode(last);
  if (!parsed || !low || !high) return null;
  // Ordering only means something inside one numbering series. A zone whose first and last codes
  // carry different prefixes is not a range this module can reason about.
  if (low.prefix !== high.prefix) return null;
  if (parsed.prefix !== low.prefix) return null;
  return parsed.value >= low.value && parsed.value <= high.value;
}

/**
 * The problem with `code`, or `null` when there is none to report yet — including for an empty
 * field, which is incomplete rather than wrong and is handled by keeping the submit button disabled.
 */
export function checkSpaceCode(
  code: string,
  format: ParkingSpaceFormat | undefined,
  zone: ParkingZone | null | undefined,
): SpaceCodeProblem | null {
  const trimmed = code.trim();
  if (trimmed.length === 0) return null;

  if (!matchesFormat(trimmed, format)) {
    return { kind: 'format', example: format?.example ?? '' };
  }

  const range = zone?.spaceCodes;
  if (range && range.count > 0) {
    const inside = isInsideRange(trimmed, range.first, range.last);
    if (inside === false) return { kind: 'range', first: range.first, last: range.last };
  }

  return null;
}
