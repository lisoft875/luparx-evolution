package cr.luparx.tenancy.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Typed key/value configuration of a tenant (CONTRACT.md §5 {@code tenant_settings}). The value is a
 * JSON document so a setting can be a scalar, a list or a small object without a schema migration
 * per setting; the allowed keys and their shapes are declared in
 * {@link cr.luparx.tenancy.model.TenantSettingKey}.
 */
@Entity
@Table(name = "tenant_settings")
@IdClass(TenantSettingId.class)
public class TenantSetting {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Id
    @Column(name = "key", nullable = false, length = 128)
    private String settingKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "value", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> value;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected TenantSetting() {
        // for JPA
    }

    public TenantSetting(UUID tenantId, String settingKey, Map<String, Object> value, Instant updatedAt,
                         UUID updatedBy) {
        this.tenantId = tenantId;
        this.settingKey = settingKey;
        this.value = value;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getSettingKey() {
        return settingKey;
    }

    public Map<String, Object> getValue() {
        return value;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public void update(Map<String, Object> value, Instant updatedAt, UUID updatedBy) {
        this.value = value;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }
}
