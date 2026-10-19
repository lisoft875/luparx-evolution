package cr.luparx.parking.repository;

import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The wallet ledger. Paginated by contract: a citizen who parks daily accumulates movements without
 * limit, so "their movements" is never an unbounded read.
 */
public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {

    Page<WalletTransaction> findByTenantIdAndUserIdOrderByCreatedAtDesc(UUID tenantId, UUID userId,
                                                                        Pageable pageable);

    List<WalletTransaction> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);

    /**
     * Cuántos movimientos tienen ese origen, en TODA la instalación.
     *
     * <p>La única consulta de este repositorio que no se acota por municipalidad, y por eso lleva
     * esta nota: no responde una pregunta de negocio sino de integridad de la instalación —si hay
     * saldo de prueba en alguna parte, esta instalación no debe operar (CONTRACT.md v0.46)—, y
     * acotarla por municipalidad respondería la pregunta equivocada. La usa
     * {@code TestMoneyStartupCheck} al arrancar y nadie más.</p>
     */
    long countBySource(WalletTopupSource source);

    /**
     * Cuántos movimientos de UNA billetera tienen ese origen.
     *
     * <p>Lo lee {@code WalletService.charge} dentro de la transacción que descuenta y después de
     * tomar el bloqueo de la cuenta, que es lo que hace que la respuesta siga siendo cierta
     * cuando el débito se aplica. {@link #countBySource} contesta la pregunta de la instalación
     * entera y se usa al arrancar; ésta contesta la del gasto que está por ocurrir.</p>
     */
    long countByAccountIdAndSource(UUID accountId, WalletTopupSource source);

    /**
     * A movement already credited under this reference, if any.
     *
     * <p>The second idempotency layer for money coming from outside: an {@code Idempotency-Key}
     * protects one HTTP request, this protects the payment when the retry arrives from another
     * process — a till that reprinted a receipt, a partner replaying a batch — with a key of its own.
     * Backed by a unique index, so the race is settled in the database and not in memory.</p>
     */
    Optional<WalletTransaction> findByTenantIdAndSourceAndExternalReference(UUID tenantId, WalletTopupSource source,
                                                                           String externalReference);

    /**
     * Movements of a period grouped by kind, with their signed total (CONTRACT.md v0.36).
     *
     * <p>Signed, deliberately: a charge is negative in this ledger, and summing absolute values to
     * make a bigger number would be the first lie a financial dashboard tells.</p>
     */
    @org.springframework.data.jpa.repository.Query("""
            select t.type, count(t), coalesce(sum(t.amountMinor), 0)
            from WalletTransaction t
            where t.tenantId = :tenantId and t.createdAt >= :from and t.createdAt < :to
            group by t.type
            """)
    java.util.List<Object[]> countByType(
            @org.springframework.data.repository.query.Param("tenantId") java.util.UUID tenantId,
            @org.springframework.data.repository.query.Param("from") java.time.Instant from,
            @org.springframework.data.repository.query.Param("to") java.time.Instant to);
}
