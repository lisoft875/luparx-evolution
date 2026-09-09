import type { Vehicle, VehicleAttributeCatalogEntry } from '@luparx/api-client';

/**
 * How a vehicle is written out in the citizen app.
 *
 * The reference screens read "Toyota Yaris · Gris · 2015": what the car *is*, in the order a person
 * would say it, with the parts that are missing simply absent — never a placeholder, never an empty
 * separator. Type and colour arrive as catalog keys and are translated through `resolveLabel`; an
 * unknown key resolves to itself rather than to nothing, so a colour the client's dictionary has
 * not caught up with still shows something a support agent can recognise.
 *
 * Colour is data here, not styling. It is a word in a line of text; nothing on screen is ever
 * painted with the colour of somebody's car.
 */

export type LabelResolver = (labelKey: string) => string;

/** Turns a `[{value, labelKey}]` catalog into a `value → translated label` lookup. */
export function catalogLabeller(
  entries: VehicleAttributeCatalogEntry[] | undefined,
  resolveLabel: LabelResolver,
): (value: string | undefined) => string | undefined {
  const byValue = new Map((entries ?? []).map((entry) => [entry.value, entry.labelKey]));
  return (value) => {
    if (!value) return undefined;
    const labelKey = byValue.get(value);
    // A value the catalog does not list is still shown — the server said the vehicle has it, and
    // hiding it would make the screen quietly disagree with the record.
    return labelKey ? resolveLabel(labelKey) : value;
  };
}

/** `Toyota Yaris` — the make and model, or the nickname if that is all there is. */
export function vehicleModelLine(vehicle: Vehicle): string | undefined {
  const makeAndModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim();
  return makeAndModel || vehicle.name?.trim() || undefined;
}

export interface VehicleDescriptorOptions {
  /** Include the nickname alongside make/model — the vehicles list does, the compact picker does not. */
  includeName?: boolean;
  colorLabel?: string;
  includeYear?: boolean;
}

/** `Mi carro · Toyota Yaris · Gris · 2015`, with every missing part dropped. */
export function vehicleDescriptor(vehicle: Vehicle, options: VehicleDescriptorOptions = {}): string {
  const makeAndModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ').trim() || undefined;
  const parts = [
    options.includeName ? vehicle.name?.trim() || undefined : undefined,
    makeAndModel ?? (options.includeName ? undefined : vehicle.name?.trim() || undefined),
    options.colorLabel,
    options.includeYear !== false && vehicle.year ? String(vehicle.year) : undefined,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * The second line of a vehicle in the picker: `Toyota Yaris`, or `Toyota Yaris · Gris` when
 * another vehicle in the same list would read identically without the colour.
 *
 * The plate is the first line and this is what distinguishes two cars that share a description —
 * exactly the "two similar vehicles" case a picker has to survive. Undefined when there is nothing
 * to add, so the option is one line rather than one line and an empty one.
 */
export function vehicleOptionDetail(
  vehicle: Vehicle,
  vehicles: Vehicle[],
  colorOf: (value: string | undefined) => string | undefined,
): string | undefined {
  const base = vehicleDescriptor(vehicle, { includeName: false, includeYear: false });
  const ambiguous = vehicles.some(
    (other) =>
      other.id !== vehicle.id && vehicleDescriptor(other, { includeName: false, includeYear: false }) === base,
  );
  const description = ambiguous
    ? vehicleDescriptor(vehicle, { includeName: false, colorLabel: colorOf(vehicle.color), includeYear: false })
    : base;
  return description || undefined;
}
