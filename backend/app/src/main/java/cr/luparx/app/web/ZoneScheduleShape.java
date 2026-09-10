package cr.luparx.app.web;

import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.entity.ParkingZoneScheduleSlot;

import java.util.ArrayList;
import java.util.List;

/**
 * The same one-line rendering as {@link ScheduleShape}, for a zone's own bands (CONTRACT.md v0.32).
 *
 * <p>A separate entry point rather than a shared interface over the two slot types: they are two
 * tables on two different read paths (v0.31), and introducing an interface so that one formatter
 * could take both would make the domain carry a type that exists only to please a log line.</p>
 */
final class ZoneScheduleShape {

    private ZoneScheduleShape() {
    }

    static String of(List<ParkingZoneScheduleSlot> slots) {
        List<ParkingScheduleSlot> asMunicipal = new ArrayList<>(slots.size());
        for (ParkingZoneScheduleSlot slot : slots) {
            asMunicipal.add(new ParkingScheduleSlot(slot.getId(), slot.getTenantId(), slot.weekday(),
                    slot.band(), slot.getCreatedAt()));
        }
        return ScheduleShape.of(asMunicipal);
    }
}
