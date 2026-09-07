package cr.luparx.geo.repository;

import cr.luparx.geo.entity.CountryAdminLevel;
import cr.luparx.geo.entity.CountryAdminLevelId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CountryAdminLevelRepository extends JpaRepository<CountryAdminLevel, CountryAdminLevelId> {

    List<CountryAdminLevel> findByCountryCodeOrderByLevelAsc(String countryCode);
}
