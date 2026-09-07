package cr.luparx.geo.repository;

import cr.luparx.geo.entity.Country;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Global catalogue; no tenant filter applies (docs/ARCHITECTURE.md §1: geo has no tenant_id). */
public interface CountryRepository extends JpaRepository<Country, String> {

    List<Country> findByActiveTrueOrderByCodeAsc();
}
