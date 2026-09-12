package cr.luparx.app.web.dto;

import cr.luparx.billing.model.CheckoutState;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.port.CardNetwork;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes of the card top-up ({@code /api/v1/citizen/wallet/checkouts/**} — ADR 0023).
 *
 * <h2>Lo que no hay aquí, y nunca va a haber</h2>
 *
 * <p>No card number, no expiry, no security code, in any direction. The citizen types their card on the
 * provider's own page, which is what keeps LupaRX at PCI DSS SAQ A (ADR 0023 §1). A field for a card
 * number appearing in this file later is a security finding, not a feature — and it is written here so
 * that whoever is tempted reads this first.</p>
 *
 * <p>Nothing on the way <em>in</em> carries a result either. The return endpoint takes a token and
 * nothing else: a request that could tell us a payment succeeded is a request anybody can make.</p>
 */
public final class CheckoutDtos {

    private CheckoutDtos() {
    }

    /**
     * "Charge this much to a card."
     *
     * <p>No currency: it is the municipality's, taken from the tenant. A client that could name one could
     * pay ₡5.000 worth of a stronger currency.</p>
     *
     * @param amountMinor how much, in minor units. Integers only, never a decimal (ADR 0009)
     */
    public record StartCheckoutRequest(@NotNull @Min(1) Long amountMinor) {
    }

    /**
     * Where to send the citizen.
     *
     * @param redirectUrl the provider's page. The client navigates to it; it does not fetch it
     * @param opened      false when an identical earlier request had already opened this hand-off, so the
     *                    interface can avoid saying "starting payment" twice
     */
    public record CheckoutResponse(UUID id,
                                   String provider,
                                   String redirectUrl,
                                   CheckoutState state,
                                   String stateLabelKey,
                                   ParkingDtos.MoneyDto amount,
                                   Instant expiresAt,
                                   boolean opened) {
    }

    /**
     * What became of an attempt, for the screen the citizen lands back on.
     *
     * <p>{@code paymentState} is read from the payment and not from this hand-off, because that is the
     * one place the state of the money lives (ADR 0023 §5).</p>
     *
     * @param credited      true only on the call that actually moved the balance, so the interface can
     *                      distinguish "credited" from "you already knew that"
     * @param cardLast4     the four digits the citizen recognises on their own statement
     * @param failureReason the provider's own words, when it refused. Shown as given: a bank's wording is
     *                      what the citizen will repeat to their bank
     */
    public record CheckoutResultResponse(UUID id,
                                         CheckoutState state,
                                         String stateLabelKey,
                                         PaymentState paymentState,
                                         String paymentStateLabelKey,
                                         ParkingDtos.MoneyDto amount,
                                         boolean credited,
                                         CardNetwork network,
                                         String networkLabelKey,
                                         String cardLast4,
                                         String failureCode,
                                         String failureReason,
                                         Instant resolvedAt) {
    }

    /**
     * Whether this municipality takes cards, and which ones.
     *
     * <p>Asked before the button is drawn. A municipality with no provider configured is a normal state,
     * not an error: it collects at its counter and through partners, and the interface says so instead of
     * offering a payment that cannot happen.</p>
     *
     * @param networks the schemes the provider accepts, for the logos the citizen looks for
     */
    public record CardPaymentAvailability(boolean available,
                                          String provider,
                                          List<CardNetwork> networks,
                                          ParkingDtos.MoneyDto minimum,
                                          ParkingDtos.MoneyDto maximum) {
    }
}
