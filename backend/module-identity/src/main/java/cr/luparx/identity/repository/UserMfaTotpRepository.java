package cr.luparx.identity.repository;

import cr.luparx.identity.entity.UserMfaTotp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface UserMfaTotpRepository extends JpaRepository<UserMfaTotp, UUID> {
}
