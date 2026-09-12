import type { DocumentTypeCatalogEntry, IdentityDocumentType } from '@luparx/api-client';

/**
 * Which identity-document type a form opens on, for the country the user has already chosen.
 *
 * <p>One function, every screen that asks for a document: registration, "my account", accepting an
 * invitation, creating a member of staff, and the lookup dialog that finds a person by document.
 * They used to each decide for themselves — one preselected nothing, another preselected only when
 * the country offered exactly one type — which is how the same platform came to ask a Costa Rican
 * citizen to pick "cédula" out of five options on one screen and not on the next.</p>
 *
 * <p><b>The rule is data, never code.</b> The answer is the catalog entry the country marked as its
 * default (`identity_document_types.is_default`, at most one per country by a partial unique index;
 * see migration V20_0). Costa Rica marks the national id — the cédula — and the server already
 * returns the list in the country's configured presentation order, so the preselected type is also
 * the first option offered. Neither fact is written down here: adding a country, or changing which
 * document its residents are assumed to carry, is a row in the database and not a release.</p>
 *
 * <p>Returns `undefined` when the catalogue expresses no preference, and the form then shows its
 * placeholder and asks. Guessing — "the first one", "the passport" — would be worse than asking:
 * a document type that is wrong but plausible is one the user never notices having submitted.</p>
 *
 * <p>The single-entry shortcut is not a guess: where a country issues one type there is no choice
 * to make, and preselecting it saves a click without hiding anything.</p>
 */
export function preselectedDocumentType(
  entries: readonly DocumentTypeCatalogEntry[] | undefined,
): IdentityDocumentType | undefined {
  if (!entries || entries.length === 0) return undefined;
  const declared = entries.find((entry) => entry.default);
  if (declared) return declared.type;
  if (entries.length === 1) return entries[0]!.type;
  return undefined;
}
