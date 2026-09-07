package cr.luparx.tenancy.repository;

import cr.luparx.tenancy.entity.TenantSetting;
import cr.luparx.tenancy.entity.TenantSettingId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Every read is scoped by tenant_id; there is no method that returns settings across tenants. */
public interface TenantSettingRepository extends JpaRepository<TenantSetting, TenantSettingId> {

    List<TenantSetting> findByTenantIdOrderBySettingKeyAsc(UUID tenantId);

    Optional<TenantSetting> findByTenantIdAndSettingKey(UUID tenantId, String settingKey);
}
