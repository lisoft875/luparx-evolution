package cr.luparx.app.config;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.repository.CitationRepository;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EvidenceService;
import cr.luparx.enforcement.service.InfractionTypeService;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.VehicleRepository;
import cr.luparx.tenancy.entity.Tenant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Gives every seeded municipality an infraction catalogue and a handful of citations that are not all
 * in the same state.
 *
 * <h2>Why not one row per municipality</h2>
 *
 * <p>An enforcement screen with three identical {@code ISSUED} rows looks correct whatever the code
 * behind it does. The fixture below is built so that things can visibly be <em>wrong</em>: a citation
 * that is a draft with no number, one that was annulled and carries the reason, one under appeal, one
 * already paid, and one whose plate is registered by two different citizens and is therefore linked to
 * neither — the exact case the citizen's "my fines" screen must not leak across.</p>
 *
 * <p>Catalogues differ per municipality on purpose too: one kind that demands a photograph and one
 * that does not, one that admits no defence, one with an early-payment discount and one without. Each
 * of those is a branch in the domain, and a fixture where they are all the same exercises none.</p>
 *
 * <p>Idempotent by municipality: a municipality that already has citations is left alone, so a restart
 * neither duplicates history nor renumbers a series a developer was reading.</p>
 */
@Component
// También en `demo`: las boletas son parte del fixture que hace demostrable la fiscalización.
@Profile({"dev", "demo"})
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DevEnforcementSeeder {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevEnforcementSeeder.class);

    /**
     * A 1×1 transparent PNG. Real bytes with a real PNG header, because the upload path decides what a
     * file is by reading that header — a fixture with a text file named {@code .png} would pass through
     * a validator that does not work and prove nothing.
     */
    private static final byte[] PIXEL_PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    /**
     * The catalogue every municipality starts with, in minor units of its own currency. The amounts
     * are the same everywhere only because this is a fixture; nothing in the platform assumes it, and
     * the administrator's first act on a real deployment is to change them.
     */
    private static final List<TypeSeed> CATALOGUE = List.of(
            // Demands a photograph: this is the one that produces a DRAFT and exercises the two-step
            // capture the street actually needs.
            new TypeSeed("NOPAGO", "Estacionar sin pago vigente", "El vehículo ocupa una bahía de cobro "
                    + "sin sesión de parqueo vigente.", 1_500_00L, true, true, 8, 50, 30),
            // No photograph required: issued in one call, which is what a bulk fixture needs to be
            // able to produce several states quickly.
            new TypeSeed("VENCIDA", "Tiempo vencido", "La sesión de parqueo terminó y el vehículo sigue "
                    + "en la bahía.", 1_000_00L, false, true, 8, 50, 30),
            new TypeSeed("BAHIAERR", "Bahía distinta a la pagada", "El pago corresponde a otra bahía de "
                    + "la misma municipalidad.", 800_00L, true, true, null, null, 30),
            // Admits no defence: the citation is written where the vehicle should never have been at
            // all, and the municipality does not open that to appeal.
            new TypeSeed("DISCAP", "Ocupar espacio de persona con discapacidad", "El vehículo ocupa un "
                    + "espacio reservado sin la identificación correspondiente.", 5_000_00L, true, false, null,
                    null, 15),
            new TypeSeed("OBSTR", "Obstruir acceso o esquina", "El vehículo obstruye una rampa, una "
                    + "entrada o una esquina.", 2_500_00L, true, true, 5, 25, 20));

    private final InfractionTypeService infractionTypeService;
    private final CitationService citationService;
    private final EvidenceService evidenceService;
    private final CitationRepository citationRepository;
    private final ParkingZoneRepository zoneRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    public DevEnforcementSeeder(InfractionTypeService infractionTypeService,
                                CitationService citationService,
                                EvidenceService evidenceService,
                                CitationRepository citationRepository,
                                ParkingZoneRepository zoneRepository,
                                ParkingSpaceRepository spaceRepository,
                                VehicleRepository vehicleRepository,
                                UserRepository userRepository,
                                Clock clock) {
        this.infractionTypeService = infractionTypeService;
        this.citationService = citationService;
        this.evidenceService = evidenceService;
        this.citationRepository = citationRepository;
        this.zoneRepository = zoneRepository;
        this.spaceRepository = spaceRepository;
        this.vehicleRepository = vehicleRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    /**
     * @param tenants  the seeded municipalities by slug
     * @param citizens the seeded citizens by email, so a citation can be linked to a vehicle somebody
     *                 actually owns and the citizen's "my fines" screen is not empty
     */
    public void seed(Map<String, Tenant> tenants, Map<String, UserId> citizens) {
        List<String> linkablePlates = linkablePlates(citizens);
        int index = 0;
        for (Map.Entry<String, Tenant> entry : tenants.entrySet()) {
            Tenant tenant = entry.getValue();
            if (tenant == null) {
                continue;
            }
            String plate = linkablePlates.isEmpty() ? null : linkablePlates.get(index++ % linkablePlates.size());
            try {
                seedCatalogue(tenant);
                seedCitations(entry.getKey(), tenant, plate);
            } catch (RuntimeException exception) {
                LOGGER.warn("Development seed: enforcement fixture skipped for {} ({}).", entry.getKey(),
                        exception.toString());
            }
        }
    }

    /**
     * Plates of seeded citizens that are registered by exactly one person.
     *
     * <p>Only those can be linked to a citation, and that is the product rule rather than a fixture
     * convenience: when two citizens registered the same plate the platform refuses to guess an owner
     * (see {@code ParkingStatusPort.findUniqueVehicleByPlate}). Seeding both kinds — a linkable plate
     * and the deliberately duplicated {@code SJP123} — is what lets a developer see the difference on
     * the citizen's screen.</p>
     */
    private List<String> linkablePlates(Map<String, UserId> citizens) {
        List<String> plates = new java.util.ArrayList<>();
        for (UserId userId : citizens.values()) {
            for (Vehicle vehicle : vehicleRepository.findByUserIdOrderByCreatedAtAsc(userId.value())) {
                if (vehicleRepository.findByPlateNormalizedOrderByCreatedAtAsc(vehicle.getPlateNormalized())
                        .size() == 1) {
                    plates.add(vehicle.getPlateNormalized());
                }
            }
        }
        return plates;
    }

    private void seedCatalogue(Tenant tenant) {
        TenantId tenantId = TenantId.of(tenant.getId());
        if (!infractionTypeService.list(tenantId).isEmpty()) {
            return;
        }
        List<InfractionTypeService.Draft> drafts = CATALOGUE.stream()
                .map(seed -> new InfractionTypeService.Draft(null, seed.code(), seed.name(), seed.description(),
                        seed.amountMinor(), seed.requiresPhoto(), seed.allowsAppeal(), seed.discountDays(),
                        seed.discountPercent(), seed.dueDays(), true))
                .toList();
        infractionTypeService.replace(tenantId, drafts);
        LOGGER.info("Development seed: {} infraction types for {}.", drafts.size(), tenant.getSlug());
    }

    private void seedCitations(String slug, Tenant tenant, String citizenPlate) {
        TenantId tenantId = TenantId.of(tenant.getId());
        if (citationRepository.countByTenantId(tenant.getId()) > 0L) {
            return;
        }
        Optional<User> inspector = findInspector(slug);
        if (inspector.isEmpty()) {
            return;
        }
        EnforcementActor actor = EnforcementActor.of(UserId.of(inspector.get().getId()), Portal.INSPECTOR, null);
        List<ParkingZone> zones = zoneRepository.findByTenantIdAndActiveTrueOrderByCodeAsc(tenant.getId());
        if (zones.isEmpty()) {
            return;
        }
        ParkingZone zone = zones.get(0);
        List<ParkingSpace> spaces = spaceRepository
                .findByTenantIdAndZoneIdOrderByCodeAsc(tenant.getId(), zone.getId(), PageRequest.of(0, 4))
                .getContent();
        Map<String, InfractionType> types = index(infractionTypeService.listActive(tenantId));
        Instant now = clock.instant();

        // 1. Issued in one call: the kind that needs no photograph. Linked to a seeded citizen's
        //    vehicle when there is one, so the citizen app has a fine to show.
        String plate = citizenPlate == null ? "XYZ987" : citizenPlate;
        Citation overdue = capture(tenantId, actor, types.get("VENCIDA"), plate, zone, space(spaces, 0),
                now.minus(3, ChronoUnit.DAYS), "dev-" + slug + "-1", "Frente al parque central");
        if (overdue == null) {
            return;
        }

        // 2. Draft awaiting its photograph, then issued: the two-step street flow, with real bytes
        //    going through the real evidence store.
        Citation withPhoto = capture(tenantId, actor, types.get("NOPAGO"), "BCT456", zone, space(spaces, 1),
                now.minus(2, ChronoUnit.DAYS), "dev-" + slug + "-2", "Costado sur del mercado");
        if (withPhoto != null && withPhoto.getStatus() == CitationStatus.DRAFT) {
            evidenceService.attachPhoto(tenantId, actor, withPhoto.getId(), PIXEL_PNG, "evidencia.png",
                    now.minus(2, ChronoUnit.DAYS), new BigDecimal("9.932100"), new BigDecimal("-84.079500"));
            evidenceService.attachNote(tenantId, actor, withPhoto.getId(),
                    "Vehículo sin comprobante visible; se tomó fotografía del parabrisas.");
            citationService.issue(tenantId, actor, withPhoto.getId());
        }

        // 3. Annulled with a reason: what the history screen exists to show.
        Citation cancelled = capture(tenantId, actor, types.get("VENCIDA"), "SJP123", zone, space(spaces, 2),
                now.minus(4, ChronoUnit.DAYS), "dev-" + slug + "-3", "Avenida segunda");
        if (cancelled != null) {
            citationService.cancel(tenantId, actor, cancelled.getId(),
                    "Anulada: la sesión estaba vigente y no se sincronizó a tiempo.");
        }

        // 4. Under appeal, and 5. already paid: the two ends of the legal cycle.
        Citation appealed = capture(tenantId, actor, types.get("VENCIDA"), "MOT001", zone, space(spaces, 3),
                now.minus(5, ChronoUnit.DAYS), "dev-" + slug + "-4", "Calle 7");
        if (appealed != null) {
            citationService.transition(tenantId, actor, appealed.getId(), CitationStatus.APPEALED,
                    CitationAction.APPEALED, "El conductor presenta comprobante de pago del mismo día.", true);
        }
        Citation paid = capture(tenantId, actor, types.get("VENCIDA"), "PAG777", zone, space(spaces, 0),
                now.minus(6, ChronoUnit.DAYS), "dev-" + slug + "-5", "Bulevar principal");
        if (paid != null) {
            citationService.transition(tenantId, actor, paid.getId(), CitationStatus.PAID, CitationAction.PAID,
                    "Pagada en caja municipal.", false);
        }

        // 6. A draft left as a draft, so the officer's app has one to finish.
        capture(tenantId, actor, types.get("OBSTR"), "DRF555", zone, space(spaces, 1),
                now.minus(1, ChronoUnit.HOURS), "dev-" + slug + "-6", "Esquina de la escuela");

        LOGGER.info("Development seed: citations for {} in draft, issued, appealed, paid and annulled states.",
                slug);
    }

    private Citation capture(TenantId tenantId, EnforcementActor actor, InfractionType type, String plate,
                             ParkingZone zone, ParkingSpace space, Instant occurredAt, String deviceId,
                             String address) {
        if (type == null) {
            return null;
        }
        CitationService.Capture command = new CitationService.Capture(type.getId(), plate, zone.getId(),
                space == null ? null : space.getId(), space == null ? null : space.getCode(),
                new BigDecimal("9.932100"), new BigDecimal("-84.079500"), new BigDecimal("8.0"), address,
                occurredAt, deviceId, null, null, null);
        return citationService.capture(tenantId, actor, command).citation();
    }

    /**
     * The municipality's inspector. The launch municipality keeps the original {@code
     * inspector@luparx.test}, so both spellings are tried before giving up.
     */
    private Optional<User> findInspector(String slug) {
        Optional<User> perMunicipality = userRepository.findByEmail("inspector." + slug + "@luparx.test");
        return perMunicipality.isPresent() ? perMunicipality : userRepository.findByEmail("inspector@luparx.test");
    }

    private ParkingSpace space(List<ParkingSpace> spaces, int index) {
        return spaces.size() > index ? spaces.get(index) : null;
    }

    private Map<String, InfractionType> index(List<InfractionType> types) {
        return types.stream().collect(java.util.stream.Collectors.toMap(InfractionType::getCode, type -> type,
                (first, second) -> first));
    }

    /** One entry of the seeded catalogue. Amounts in minor units, as everything monetary here is. */
    private record TypeSeed(String code, String name, String description, long amountMinor, boolean requiresPhoto,
                            boolean allowsAppeal, Integer discountDays, Integer discountPercent, int dueDays) {
    }
}
