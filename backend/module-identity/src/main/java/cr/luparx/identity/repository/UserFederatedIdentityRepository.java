package cr.luparx.identity.repository;

import cr.luparx.identity.entity.UserFederatedIdentity;
import cr.luparx.identity.model.FederatedProvider;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserFederatedIdentityRepository extends JpaRepository<UserFederatedIdentity, UUID> {

    Optional<UserFederatedIdentity> findByProviderAndSubject(FederatedProvider provider, String subject);

    List<UserFederatedIdentity> findByUserId(UUID userId);
}
