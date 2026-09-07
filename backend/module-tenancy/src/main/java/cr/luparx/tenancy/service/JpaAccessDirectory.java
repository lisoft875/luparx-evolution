package cr.luparx.tenancy.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import cr.luparx.tenancy.repository.TenantRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** JPA adapter for {@link AccessDirectory}. */
@Component
@Transactional(readOnly = true)
public class JpaAccessDirectory implements AccessDirectory {

    private final TenantMembershipRepository membershipRepository;
    private final TenantRepository tenantRepository;

    public JpaAccessDirectory(TenantMembershipRepository membershipRepository, TenantRepository tenantRepository) {
        this.membershipRepository = membershipRepository;
        this.tenantRepository = tenantRepository;
    }

    @Override
    public List<TenantMembership> membershipsOf(UserId userId) {
        return membershipRepository.findByUserId(userId.value());
    }

    @Override
    public Optional<Tenant> findTenant(TenantId tenantId) {
        return tenantId == null ? Optional.empty() : tenantRepository.findById(tenantId.value());
    }
}
