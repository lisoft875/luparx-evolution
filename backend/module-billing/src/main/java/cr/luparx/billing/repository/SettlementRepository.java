package cr.luparx.billing.repository;

import cr.luparx.billing.entity.Settlement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Provider statements of one municipality. */
public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByTenantIdAndId(UUID tenantId, UUID id);

    /** The identity of the document: importing the same statement twice must not create a second. */
    Optional<Settlement> findByTenantIdAndProviderAndExternalReference(UUID tenantId, String provider,
                                                                       String externalReference);

    Page<Settlement> findByTenantIdOrderByPeriodEndDesc(UUID tenantId, Pageable pageable);

    /**
     * Cuántos cortes del proveedor cubren, aunque sea en parte, este período (06-10-2026).
     *
     * <p>Cero es la diferencia entre «todo lo cobrado está confirmado» y «no ha llegado nada contra
     * qué confirmarlo». La pantalla de conciliación decía lo primero cuando lo cierto era lo
     * segundo, porque su única señal era que la lista de pagos sin confirmar estuviera vacía — y
     * está vacía en los dos casos.</p>
     *
     * <p>Se solapa, no se contiene: un corte que empieza antes del período y termina dentro cubre
     * parte de él y cuenta. Pedir que esté contenido entero diría «no hay cortes» justo el mes en
     * que el proveedor cambia sus fechas de corte.</p>
     */
    @Query("select count(s) from Settlement s where s.tenantId = :tenantId"
            + " and s.periodStart < :to and s.periodEnd > :from")
    long countCoveringPeriod(@Param("tenantId") UUID tenantId,
                             @Param("from") Instant from,
                             @Param("to") Instant to);
}
