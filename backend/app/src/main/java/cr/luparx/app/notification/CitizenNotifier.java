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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
     * Se emitió una boleta contra una placa que alguien registró.
     *
     * <p>Con una sola persona dueña de esa placa —o con el empate ya resuelto al emitir, porque
     * tenía una estadía corriendo— se le dice «te multaron» y se le dan los datos: es su boleta.</p>
     *
     * <p>Cuando varias personas tienen la placa en ficha se les avisa a TODAS, con el aviso
     * completo. La boleta es visible, pagable y apelable para todas ellas —el carro compartido es el
     * caso normal, no una anomalía—, así que recortarles el aviso sería esconderles algo que de
     * todos modos van a ver al abrir la aplicación. Y el aviso doble hace falta: no se sabe cuál de
     * las dos conducía, y el plazo de descuento corre para el carro.</p>
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

    /**
     * Avisa a TODOS los que tienen esa placa en ficha, con el aviso completo.
     *
     * <p>Hasta el 2026-09-19 esto avisaba sólo cuando exactamente una persona tenía la placa, y con
     * varias mandaba un aviso recortado de «reclamala». Los dos comportamientos venían de que la
     * boleta no era visible para todos, así que avisarle a alguien que no podía verla habría sido
     * cruel y avisarle con detalles, indiscreto.</p>
     *
     * <p>Ahora la boleta SÍ se ve —y se puede pagar y apelar— para todos los que tienen la placa,
     * porque el caso normal del carro compartido es real: padre e hijo con el mismo carro, cada uno
     * con la placa en su aplicación para pagar sus propios estacionamientos. Si los dos la ven,
     * los dos merecen el aviso completo, y hace falta que sea doble: no se sabe cuál de los dos
     * conducía, y el plazo de descuento corre para el carro, no para una persona.</p>
     *
     * <p>El `Set` es porque la misma persona puede tener la placa en dos fichas (la registró dos
     * veces) y no debe recibir dos correos iguales.</p>
     */
    private void record(String plateNormalized, java.util.function.Supplier<Map<String, Object>> params,
                        NotificationType type, TenantId tenantId, UUID subjectId) {
        try {
            List<ParkingStatusPort.RegisteredVehicle> registered =
                    parkingStatus.findVehiclesByPlate(plateNormalized);
            if (registered.isEmpty()) {
                // Lo corriente y lo más frecuente: la mayoría de las boletas se escriben contra
                // carros que nunca usaron la aplicación. No hay a quién avisarle, y eso no es un
                // fallo de nada.
                return;
            }
            Map<String, Object> datos = params.get();
            Set<UUID> avisados = new HashSet<>();
            for (ParkingStatusPort.RegisteredVehicle candidato : registered) {
                if (!avisados.add(candidato.ownerUserId())) {
                    continue;
                }
                notifications.record(tenantId, UserId.of(candidato.ownerUserId()), type, subjectId,
                        new HashMap<>(datos));
            }
        } catch (RuntimeException failure) {
            LOGGER.warn("Could not record a {} notification for subject {}.", type, subjectId, failure);
        }
    }
}
