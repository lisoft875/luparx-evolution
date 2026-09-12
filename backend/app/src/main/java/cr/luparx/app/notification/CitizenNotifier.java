package cr.luparx.app.notification;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.port.ParkingStatusPort;
import cr.luparx.notification.model.NotificationType;
import cr.luparx.notification.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Where two bounded contexts meet to tell a citizen something.
 *
 * <p>{@code module-enforcement} does not know that notifications exist and must not learn: a citation
 * is an administrative act with its own lifecycle, and the day it is extracted into its own service it
 * should not be carrying an inbox with it. So the join happens here, in the composition root — the
 * same place and the same reason as {@code TopupPaymentService}, which joins payments and wallets
 * without either module depending on the other.</p>
 *
 * <h2>Después del hecho, nunca en vez de él</h2>
 *
 * <p>Every method here is called once the act is already recorded, and every one of them swallows its
 * own failures. That is the established trade in this codebase (see {@code notifyGranted}): a
 * citation that could not be written down because a notification insert failed would be a
 * fiscalizador's work lost to a mailbox. The reverse — a notice that quietly never happened — costs a
 * citizen a message they were going to get anyway when they opened the app.</p>
 *
 * <p>It is a real gap and worth naming: an issue whose notification fails is not retried. The stays
 * are different, because a job re-reads its window every minute and the unique index makes the repeat
 * free. Closing this one properly means moving the issue endpoint behind an application service that
 * owns the transaction, and that is a bigger change than the one this feature asked for.</p>
 */
@Component
public class CitizenNotifier {

    private static final Logger LOGGER = LoggerFactory.getLogger(CitizenNotifier.class);

    private final NotificationService notifications;
    private final ParkingStatusPort parkingStatus;

    public CitizenNotifier(NotificationService notifications, ParkingStatusPort parkingStatus) {
        this.notifications = notifications;
        this.parkingStatus = parkingStatus;
    }

    /**
     * A citation was issued against a plate somebody registered.
     *
     * <p>The recipient is resolved through {@link ParkingStatusPort#findUniqueVehicleByPlate}, which
     * answers only when <b>exactly one</b> person has that plate on the platform. That restraint is
     * the point and it is inherited rather than invented here: plates are unique per citizen and not
     * globally (CONTRACT.md v0.2, rule 2), so telling the wrong person they have been fined is worse
     * than telling nobody — they would go looking for a citation that is not theirs, and the person
     * who was actually fined would learn nothing either way.</p>
     */
    public void citationIssued(Citation citation) {
        record(citation.getPlateNormalized(), () -> {
            Map<String, Object> params = new HashMap<>();
            params.put("citationNumber", citation.getNumber());
            params.put("plate", citation.getPlate());
            params.put("amountMinor", Long.valueOf(citation.getFineAmountMinor()));
            params.put("currencyCode", citation.getCurrencyCode());
            return params;
        }, NotificationType.CITATION_ISSUED, TenantId.of(citation.getTenantId()), citation.getId());
    }

    /**
     * The municipality resolved a defence.
     *
     * <p>The recipient is the person who filed it, taken straight off the appeal — no plate lookup and
     * no guessing. The outcome travels as a status name and not as a sentence: "accepted" and
     * "rejected" are different amounts of money and the screen says so in the reader's own language.</p>
     */
    public void appealResolved(CitationAppeal appeal, Citation citation) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("citationNumber", citation.getNumber());
            params.put("outcome", appeal.getStatus().name());
            notifications.record(TenantId.of(appeal.getTenantId()), UserId.of(appeal.getUserId()),
                    NotificationType.APPEAL_RESOLVED, citation.getId(), params);
        } catch (RuntimeException failure) {
            LOGGER.warn("Could not record the appeal-resolved notification for citation {}.",
                    citation.getId(), failure);
        }
    }

    /**
     * Money reached a wallet.
     *
     * <p>Unlike the two above, this one is called from inside {@code TopupPaymentService}'s own
     * transaction, so the credit and the notice are one fact. It can be: that service is already the
     * place where payments and wallets are joined, and it is already the one transaction that owns
     * both.</p>
     */
    public void topUpCredited(TenantId tenantId, UserId beneficiary, UUID transactionId,
                              long amountMinor, String currencyCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("amountMinor", Long.valueOf(amountMinor));
        params.put("currencyCode", currencyCode);
        notifications.record(tenantId, beneficiary, NotificationType.WALLET_TOPUP_CREDITED,
                transactionId, params);
    }

    private void record(String plateNormalized, java.util.function.Supplier<Map<String, Object>> params,
                        NotificationType type, TenantId tenantId, UUID subjectId) {
        try {
            Optional<ParkingStatusPort.RegisteredVehicle> owner =
                    parkingStatus.findUniqueVehicleByPlate(plateNormalized);
            if (owner.isEmpty()) {
                // Ordinary and frequent: most citations are written against cars that never used the
                // app. There is nobody to tell, and that is not a failure of anything.
                return;
            }
            notifications.record(tenantId, UserId.of(owner.get().ownerUserId()), type, subjectId, params.get());
        } catch (RuntimeException failure) {
            LOGGER.warn("Could not record a {} notification for subject {}.", type, subjectId, failure);
        }
    }
}
