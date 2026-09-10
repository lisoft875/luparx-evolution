package cr.luparx.geo.repository;

import cr.luparx.geo.entity.HolidayCatalogEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** The holidays of a country. Reference data: read by everyone, written by a migration. */
public interface HolidayCatalogRepository extends JpaRepository<HolidayCatalogEntry, UUID> {

    List<HolidayCatalogEntry> findByCountryCodeAndActiveTrueOrderBySortOrderAsc(String countryCode);
}
