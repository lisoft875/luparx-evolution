package cr.luparx.tenancy.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * "Registered users" at tenant level (CONTRACT.md §1): computed from memberships, never from the
 * global user table, so one municipality's report can never count another's people.
 */
@Service
@Transactional(readOnly = true)
public class TenantReportService {

    private final TenantMembershipRepository membershipRepository;

    public TenantReportService(TenantMembershipRepository membershipRepository) {
        this.membershipRepository = membershipRepository;
    }

    public RegisteredUsersReport byPortal(TenantId tenantId, Instant from, Instant to) {
        List<Object[]> rows = membershipRepository.countByPortalInTenant(tenantId.value(), from, to);
        List<RegisteredUsersReport.Row> result = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            result.add(new RegisteredUsersReport.Row(String.valueOf(row[0]), ((Number) row[1]).longValue()));
        }
        return new RegisteredUsersReport("portal", result);
    }

    /** Platform-scope aggregate across tenants. Only reachable from {@code /api/v1/platform/**}. */
    public RegisteredUsersReport byTenant(Instant from, Instant to) {
        List<Object[]> rows = membershipRepository.countByTenant(from, to);
        List<RegisteredUsersReport.Row> result = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            UUID tenantId = (UUID) row[0];
            result.add(new RegisteredUsersReport.Row(tenantId == null ? "PLATFORM" : tenantId.toString(),
                    ((Number) row[1]).longValue()));
        }
        return new RegisteredUsersReport("tenant", result);
    }

    public long countActiveMembers(TenantId tenantId) {
        return membershipRepository.countByTenantIdAndStatus(tenantId.value(), MembershipStatus.ACTIVE);
    }
}
