package cr.luparx.geo.service;

import cr.luparx.geo.entity.HolidayCatalogEntry;
import cr.luparx.geo.repository.HolidayCatalogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

/**
 * The public holidays of a country (CONTRACT.md v0.31).
 *
 * <p>Read-only by design: this catalogue is written by a migration and never by an endpoint. Adding a
 * country's holidays is a change to the platform's reference data, reviewed like any other, not
 * something one municipality can do to every other municipality in that country.</p>
 *
 * <p>What a municipality does with it is <b>copy</b>: the rules become its own timetable exceptions,
 * which it then owns and can edit. Nothing on the pricing path reads this table, which is what keeps
 * {@code module-parking} free of any dependency on {@code module-geo}.</p>
 */
@Service
public class HolidayCatalogService {

    private final HolidayCatalogRepository repository;

    public HolidayCatalogService(HolidayCatalogRepository repository) {
        this.repository = repository;
    }

    /**
     * The holidays of a country, in the order they fall through the year.
     *
     * <p>An unknown country answers with an empty list rather than an error: the platform simply has
     * no calendar for it yet, and a municipality there configures its own dates by hand — which it
     * could always do. Failing would turn "we have not loaded that country" into a screen that cannot
     * open.</p>
     */
    @Transactional(readOnly = true)
    public List<HolidayCatalogEntry> forCountry(String countryCode) {
        if (countryCode == null || countryCode.isBlank()) {
            return List.of();
        }
        return repository.findByCountryCodeAndActiveTrueOrderBySortOrderAsc(
                countryCode.trim().toUpperCase(Locale.ROOT));
    }
}
