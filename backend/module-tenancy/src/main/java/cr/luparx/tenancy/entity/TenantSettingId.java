package cr.luparx.tenancy.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** Composite identifier of {@link TenantSetting}: (tenant_id, key). */
public class TenantSettingId implements Serializable {

    private static final long serialVersionUID = 1L;

    private UUID tenantId;
    private String settingKey;

    public TenantSettingId() {
    }

    public TenantSettingId(UUID tenantId, String settingKey) {
        this.tenantId = tenantId;
        this.settingKey = settingKey;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public String getSettingKey() {
        return settingKey;
    }

    public void setSettingKey(String settingKey) {
        this.settingKey = settingKey;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof TenantSettingId that)) {
            return false;
        }
        return Objects.equals(tenantId, that.tenantId) && Objects.equals(settingKey, that.settingKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(tenantId, settingKey);
    }
}
