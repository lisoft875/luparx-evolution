package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.EnforcementSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** Per-municipality enforcement settings; absent means the platform default. */
public interface EnforcementSettingsRepository extends JpaRepository<EnforcementSettings, UUID> {
}
