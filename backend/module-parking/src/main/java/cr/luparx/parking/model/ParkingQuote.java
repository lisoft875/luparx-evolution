package cr.luparx.parking.model;

import cr.luparx.core.money.Money;

/**
 * What a stay of {@code minutes} would cost right now, computed on the server (CONTRACT.md v0.2:
 * "El cálculo del monto y del crédito ocurre siempre en el servidor").
 *
 * <p>Four numbers, and they are not interchangeable:</p>
 * <ul>
 *   <li>{@code chargeableMinutes} — of the minutes asked for, the ones that fall inside the
 *       municipality's charging hours. A stay from 17:30 to 19:00 where charging closes at 18:00 has
 *       ninety minutes and thirty chargeable ones (CONTRACT.md v0.3, "Horario de cobro");</li>
 *   <li>{@code amount} — the full price of the <em>chargeable</em> minutes, what the stay would cost
 *       with no credit at all;</li>
 *   <li>{@code creditMinutesApplied} — minutes taken from the citizen's balance of minutes;</li>
 *   <li>{@code payable} — the money that will actually leave the wallet.</li>
 * </ul>
 *
 * <p>Credit is spent on chargeable minutes only. Paying with minutes for time that is free anyway
 * would quietly burn a citizen's balance on a Sunday afternoon.</p>
 *
 * <p>{@code payable} is not {@code amount} minus a converted credit: minutes are not money. The
 * remaining minutes are priced on their own, so a tariff charged per started block is applied to
 * what is really being bought.</p>
 *
 * @param minutes              minutes requested
 * @param chargeableMinutes    of those, the ones inside the municipality's charging hours
 * @param creditMinutesApplied minutes covered by the citizen's credit in this municipality
 * @param payableMinutes       chargeable minutes still to be paid for
 *                             ({@code chargeableMinutes - creditMinutesApplied})
 * @param amount               full price of {@code chargeableMinutes}
 * @param payable              price of {@code payableMinutes}, the amount charged to the wallet
 */
public record ParkingQuote(
        int minutes,
        int chargeableMinutes,
        int creditMinutesApplied,
        int payableMinutes,
        Money amount,
        Money payable) {

    public boolean isFullyCoveredByCredit() {
        return payable.isZero();
    }

    /** True when the whole requested stay falls outside the municipality's charging hours. */
    public boolean isEntirelyOutsideChargingHours() {
        return chargeableMinutes == 0;
    }
}
