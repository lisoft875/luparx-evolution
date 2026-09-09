package cr.luparx.tenancy.repository;

import cr.luparx.tenancy.entity.MembershipZone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** The sectors assigned to each member of staff (CONTRACT.md v0.15). */
public interface MembershipZoneRepository extends JpaRepository<MembershipZone, MembershipZone.Id> {

    List<MembershipZone> findByIdMembershipId(UUID membershipId);

    /**
     * Every assignment of a set of memberships in one query — what the staff list needs so that
     * showing twenty officers with their sectors is two queries and not twenty-one.
     */
    @Query("select z from MembershipZone z where z.id.membershipId in :membershipIds")
    List<MembershipZone> findByMembershipIds(@Param("membershipIds") Collection<UUID> membershipIds);

    @Modifying
    @Query("delete from MembershipZone z where z.id.membershipId = :membershipId")
    void deleteByMembershipId(@Param("membershipId") UUID membershipId);
}
