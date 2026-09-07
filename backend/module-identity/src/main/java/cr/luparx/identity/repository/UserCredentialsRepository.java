package cr.luparx.identity.repository;

import cr.luparx.identity.entity.UserCredentials;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface UserCredentialsRepository extends JpaRepository<UserCredentials, UUID> {
}
