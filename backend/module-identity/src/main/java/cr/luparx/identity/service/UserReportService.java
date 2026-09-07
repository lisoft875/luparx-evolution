package cr.luparx.identity.service;

import cr.luparx.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Platform-level "registered users" figures (CONTRACT.md §1: the report exists at two levels — per
 * municipality via memberships, and platform-wide via {@code users}). This class provides only the
 * platform-wide half; the per-tenant half lives in module-tenancy and never reads this table.
 */
@Service
@Transactional(readOnly = true)
public class UserReportService {

    private final UserRepository userRepository;

    public UserReportService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** One row per nationality (ISO 3166-1 alpha-2). */
    public List<Row> countByCountry(Instant from, Instant to) {
        return toRows(userRepository.countByCountry(from, to));
    }

    /** One row per {@code YYYY-MM} bucket, computed in UTC. */
    public List<Row> countByMonth(Instant from, Instant to) {
        return toRows(userRepository.countByMonth(from, to));
    }

    public long countTotal(Instant from, Instant to) {
        return userRepository.countByCreatedAtBetween(from, to);
    }

    private List<Row> toRows(List<Object[]> raw) {
        List<Row> rows = new ArrayList<>(raw.size());
        for (Object[] entry : raw) {
            rows.add(new Row(entry[0] == null ? "UNKNOWN" : String.valueOf(entry[0]),
                    ((Number) entry[1]).longValue()));
        }
        return rows;
    }

    public record Row(String group, long count) {
    }
}
