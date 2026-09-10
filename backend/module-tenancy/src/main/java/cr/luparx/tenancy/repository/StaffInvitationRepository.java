package cr.luparx.tenancy.repository;

import cr.luparx.tenancy.entity.StaffInvitation;
import cr.luparx.tenancy.model.InvitationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Invitations of a municipality.
 *
 * <p>The lookup by token hash is the one query with no tenant parameter, and that is correct: a
 * person following a link out of their mailbox does not know which municipality invited them, and
 * the token is what identifies the invitation. Everything else is narrowed by tenant.</p>
 */
public interface StaffInvitationRepository extends JpaRepository<StaffInvitation, UUID> {

    Optional<StaffInvitation> findByTokenHash(String tokenHash);

    Optional<StaffInvitation> findByIdAndTenantId(UUID id, UUID tenantId);

    /** The live one for this address, if any. At most one exists — a partial unique index says so. */
    Optional<StaffInvitation> findByTenantIdAndEmailAndStatus(UUID tenantId, String email, InvitationStatus status);

    Page<StaffInvitation> findByTenantIdAndStatusOrderByCreatedAtDesc(UUID tenantId, InvitationStatus status,
                                                                     Pageable pageable);

    Page<StaffInvitation> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    List<StaffInvitation> findByTenantIdAndStatus(UUID tenantId, InvitationStatus status);
}
