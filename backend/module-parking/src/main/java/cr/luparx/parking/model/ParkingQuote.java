package cr.luparx.parking.model;

import cr.luparx.core.money.Money;

/**
 * What a stay of {@code minutes} would cost right now, computed on the server (CONTRACT.md v0.2:
 * "El cálculo del monto y del crédito ocurre siempre en el servidor").
 *
 * <p>Three numbers, and they are not interchangeable:</p>
 * <ul>
 *   <li>{@code amount} — the full price of the stay, what it would cost with no credit at all;</li>
 *   <li>{@code creditMinutesApplied} — minutes taken from the citizen's balance of minutes;</li>
 *   <li>{@code payable} — the money that will actually leave the wallet.</li>
 * </ul>
 *
 * <p>{@code payable} is not {@code amount} minus a converted credit: minutes are not money. The
 * remaining minutes are priced on their own, so a tariff charged per started block is applied to
 * what is really being bought.</p>
 *
 * @param minutes              minutes requested
 * @param creditMinutesApplied minutes covered by the citizen's credit in this municipality
 * @param payableMinutes       minutes still to be paid for ({@code minutes - creditMinutesApplied})
 * @param amount               full price of {@code minutes}
 * @param payable              price of {@code payableMinutes}, the amount charged to the wallet
 */
public record ParkingQuote(
        int minutes,
        int creditMinutesApplied,
        int payableMinutes,
        Money amount,
        Money payable) {

    public boolean isFullyCoveredByCredit() {
        return payable.isZero();
    }
}
