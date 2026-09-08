package cr.luparx.app.config;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * The municipalities the development fixture operates, as data.
 *
 * <h2>What this is, and what it is not</h2>
 *
 * <p>Every value below is <b>seed data</b>: real cantons, real districts, plausible sectors and
 * prices. None of it is an assumption of the platform. Country, currency, locale and time zone still
 * come from {@code platform.defaults.*} through the tenant, and every rule each municipality operates
 * under is a row it owns ({@code parking_policies}, {@code parking_schedules},
 * {@code parking_space_formats}) — the constants here only decide what the fixture writes into those
 * rows on a laptop. A deployment in another country replaces this file and no domain logic moves
 * (CONTRACT.md §7).</p>
 *
 * <h2>Why five municipalities and not one</h2>
 *
 * <p>One municipality cannot exercise a multi-tenant platform. With a single tenant every bug that
 * matters here is invisible: a price list that leaks across municipalities, a bay code format assumed
 * to be four digits, a charging timetable assumed to be the launch one, a wallet balance assumed to
 * be global. Each municipality below therefore exists to make <em>one</em> configuration real, and
 * each says which:</p>
 *
 * <table>
 *   <caption>What each municipality exercises</caption>
 *   <tr><th>Municipality</th><th>What it puts under test</th></tr>
 *   <tr><td>San José</td><td>The baseline: platform defaults untouched, four plain digits,
 *       Monday to Saturday 07:00–18:00.</td></tr>
 *   <tr><td>Escazú</td><td><b>Charging around the clock</b> ({@code charges_all_day}) and an
 *       <b>alphanumeric bay code</b> with a prefix ({@code E-} + three characters, letters allowed) —
 *       the two assumptions a client is most likely to have hardcoded.</td></tr>
 *   <tr><td>Montes de Oca</td><td><b>Short hours and a day off</b>: 08:00–17:00, Monday to Friday, no
 *       charging on Saturday or Sunday. Proves the timetable is per municipality and that a weekday
 *       with no band charges nothing.</td></tr>
 *   <tr><td>La Unión</td><td><b>Dated holidays</b>: two real public holidays loaded as exceptions, on
 *       top of a longer working day (07:00–19:00).</td></tr>
 *   <tr><td>Cartago</td><td><b>A restrictive policy</b>: extensions disabled and no credit for
 *       finishing early — the two flows a client must degrade gracefully without.</td></tr>
 * </table>
 *
 * <p>Prices differ between municipalities on purpose: a quote for the same duration in two of them
 * must come back with different amounts, which is the cheapest possible proof that pricing is
 * resolved per tenant and not from a constant.</p>
 *
 * <h2>Logos</h2>
 *
 * <p>Each municipality gets a distinct brand colour and the <b>generated monogram</b> as its logo —
 * its initials over that colour, drawn by the platform. <b>No real coat of arms is seeded.</b> A
 * municipal emblem is that municipality's official symbol; it is theirs to provide and ours to
 * display, never ours to invent, approximate or ship in a fixture. The real one is uploaded by the
 * municipality from its own admin panel ({@code PUT /api/v1/admin/settings/branding}), which replaces
 * the placeholder with an absolute https address of their choosing.</p>
 */
final class DevMunicipalities {

    private DevMunicipalities() {
    }

    /** Administrative level the zone seeds point at. For Costa Rica level 3 is the district. */
    static final int DISTRICT_LEVEL = 3;

    /**
     * The launch municipality, unchanged: it keeps the platform defaults for policy, timetable and
     * bay code format, and its own {@code luparx.dev.parking-spaces} property for how many bays it
     * gets. It is listed here so that one loop seeds every municipality, not so that anything about
     * it changes.
     */
    static final DevMunicipality SAN_JOSE = new DevMunicipality(
            "san-jose", "Municipalidad de San José", "San José", "San José", "#1d4ed8", "101",
            List.of(
                    new ZoneSeed("SJ-AMON", "Barrio Amón",
                            "Barrio Amón, al norte del centro: calles estrechas y casas patrimoniales.",
                            "10101", 10, 600L),
                    new ZoneSeed("SJ-ESCALANTE", "Barrio Escalante",
                            "Barrio Escalante y Calle 33, zona de restaurantes con alta rotación nocturna.",
                            "10101", 15, 800L),
                    new ZoneSeed("SJ-MERCADO", "Mercado Central",
                            "Entorno del Mercado Central y Avenida Central, rotación alta durante el día.",
                            "10102", 15, 700L),
                    new ZoneSeed("SJ-COLON", "Paseo Colón",
                            "Paseo Colón y sus calles transversales, corredor de oficinas hacia La Sabana.",
                            "10102", 15, 700L),
                    new ZoneSeed("SJ-HOSPITAL", "Hospital San Juan de Dios",
                            "Distrito Hospital: alrededores del Hospital San Juan de Dios y el Paso de la Vaca.",
                            "10103", 12, 600L),
                    new ZoneSeed("SJ-CATEDRAL", "Catedral – La Soledad",
                            "Distrito Catedral: barrios La Soledad y González Lahmann.",
                            "10104", 12, 600L),
                    new ZoneSeed("SJ-ZAPOTE", "Zapote Centro",
                            "Zapote centro, entre la Casa Presidencial y el redondel de Zapote.",
                            "10105", 10, 500L),
                    new ZoneSeed("SJ-SABANA", "La Sabana",
                            "Mata Redonda: costados del Parque Metropolitano La Sabana y el Estadio Nacional.",
                            "10108", 11, 500L)),
            null, null, null, 0,
            "Baseline: platform defaults, four plain digits, Monday to Saturday 07:00-18:00.");

    /**
     * The four municipalities added on top of the launch one. They share a pool of bays
     * ({@code luparx.dev.parking-spaces-total}), dealt between them by {@link DevMunicipality#spaceShare()}.
     */
    static final List<DevMunicipality> ADDITIONAL = List.of(
            new DevMunicipality(
                    "escazu", "Municipalidad de Escazú", "Escazú", "Escazú", "#047857", "102",
                    List.of(
                            new ZoneSeed("ESC-MULTIPLAZA", "San Rafael – Multiplaza",
                                    "San Rafael de Escazú: corredor de Multiplaza y las torres de oficinas.",
                                    "10203", 40, 900L),
                            new ZoneSeed("ESC-CENTRO", "Escazú centro",
                                    "Escazú centro: alrededores de la iglesia y el mercado municipal.",
                                    "10201", 35, 700L),
                            new ZoneSeed("ESC-SANANTONIO", "San Antonio",
                                    "San Antonio de Escazú, calle hacia el mirador y la zona de sodas.",
                                    "10202", 25, 600L)),
                    // Charges around the clock: no bands, no day off, no exception.
                    new ScheduleVariant(true, List.of(), 0, 0, List.of()),
                    null,
                    // Bay codes such as E-0142, and the format also accepts E-A12B: it is NOT four
                    // plain digits, and a client that assumed the San José shape fails here at once.
                    new FormatVariant("E-", 4, true),
                    24,
                    "Charges 24 hours a day; prefixed alphanumeric bay codes (E-0001, and E-A12B is valid too)."),

            new DevMunicipality(
                    "montes-de-oca", "Municipalidad de Montes de Oca", "Montes de Oca", "M. de Oca",
                    "#b45309", "115",
                    List.of(
                            new ZoneSeed("MO-SANPEDRO", "San Pedro centro",
                                    "San Pedro centro: entorno de la Universidad de Costa Rica y la Fuente de la Hispanidad.",
                                    "11501", 35, 750L),
                            new ZoneSeed("MO-DENT", "Barrio Dent",
                                    "Barrio Dent: calles residenciales convertidas en oficinas y restaurantes.",
                                    "11501", 25, 800L),
                            new ZoneSeed("MO-YOSES", "Los Yoses",
                                    "Los Yoses, sobre la avenida Central y sus calles transversales.",
                                    "11503", 20, 700L),
                            new ZoneSeed("MO-SABANILLA", "Sabanilla",
                                    "Sabanilla: entorno del campus de la UNED y el comercio de barrio.",
                                    "11502", 20, 550L)),
                    // Short working day and no Saturday: a weekday with no band charges nothing.
                    new ScheduleVariant(false,
                            List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY,
                                    DayOfWeek.FRIDAY),
                            8 * 60, 17 * 60, List.of()),
                    null, null, 30,
                    "Short hours 08:00-17:00, Monday to Friday: Saturday and Sunday are not charged."),

            new DevMunicipality(
                    "la-union", "Municipalidad de La Unión", "La Unión", "La Unión", "#7c3aed", "303",
                    List.of(
                            new ZoneSeed("LU-TRESRIOS", "Tres Ríos centro",
                                    "Tres Ríos centro: parque, iglesia y el comercio de la calle principal.",
                                    "30301", 45, 500L),
                            new ZoneSeed("LU-SANDIEGO", "San Diego",
                                    "San Diego: corredor de la carretera vieja hacia Cartago.",
                                    "30302", 30, 450L),
                            new ZoneSeed("LU-CONCEPCION", "Concepción",
                                    "Concepción: entorno del polideportivo y las escuelas.",
                                    "30305", 25, 400L)),
                    // Longer working day, and two real public holidays loaded as dated exceptions.
                    new ScheduleVariant(false,
                            List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY,
                                    DayOfWeek.FRIDAY, DayOfWeek.SATURDAY),
                            7 * 60, 19 * 60,
                            List.of(new HolidaySeed(LocalDate.of(2026, 9, 15), "Día de la Independencia"),
                                    new HolidaySeed(LocalDate.of(2026, 12, 25), "Navidad"))),
                    null, null, 18,
                    "Working day 07:00-19:00 with two public holidays loaded as dated exceptions."),

            new DevMunicipality(
                    "cartago", "Municipalidad de Cartago", "Cartago", "Cartago", "#be123c", "301",
                    List.of(
                            new ZoneSeed("CAR-CENTRO", "Centro histórico",
                                    "Centro histórico: Las Ruinas de Santiago Apóstol y el parque central.",
                                    "30101", 30, 600L),
                            new ZoneSeed("CAR-BASILICA", "Basílica de los Ángeles",
                                    "Entorno de la Basílica de Nuestra Señora de los Ángeles, con romería y ferias.",
                                    "30103", 25, 650L),
                            new ZoneSeed("CAR-MERCADO", "Mercado municipal",
                                    "Mercado municipal y su radio de carga y descarga, rotación alta de mañana.",
                                    "30102", 25, 550L),
                            new ZoneSeed("CAR-ASIS", "Barrio Asís",
                                    "Barrio Asís: calles residenciales al sur del centro, con presión de parqueo diurna.",
                                    "30105", 20, 450L)),
                    null,
                    // Extensions off and no credit for finishing early: the two flows the citizen app
                    // has to degrade gracefully without.
                    new PolicyVariant(List.of(30, 60, 120), 30, 240, false, List.of(), 240, true, false, 0, 0, 5),
                    null, 28,
                    "Extensions disabled and no credit for finishing early; sessions capped at 4 hours."));

    /** Every municipality the fixture operates, launch one first. */
    static List<DevMunicipality> all() {
        List<DevMunicipality> everything = new java.util.ArrayList<>(ADDITIONAL.size() + 1);
        everything.add(SAN_JOSE);
        everything.addAll(ADDITIONAL);
        return List.copyOf(everything);
    }

    /**
     * One municipality of the fixture.
     *
     * @param slug          public identifier, also the suffix of its staff emails
     *                      ({@code admin.<slug>@luparx.test})
     * @param legalName     legal name of the municipality
     * @param displayName   name shown to citizens
     * @param shortName     what fits in a top bar; "M. de Oca" where the display name does not
     * @param brandColor    the colour behind the generated monogram, {@code #rrggbb}
     * @param cantonCode    official canton code, for the log line only
     * @param zones         its parking zones, in the order the bay code blocks are dealt
     * @param schedule      charging timetable to write, or null to keep the platform defaults
     * @param policy        parking policy to write, or null to keep the platform defaults
     * @param format        bay code format to write, or null to keep the platform defaults
     * @param spaceShare    weight in the shared pool of bays; 0 means "uses its own property"
     * @param exercises     one sentence naming the configuration this municipality puts under test
     */
    record DevMunicipality(
            String slug,
            String legalName,
            String displayName,
            String shortName,
            String brandColor,
            String cantonCode,
            List<ZoneSeed> zones,
            ScheduleVariant schedule,
            PolicyVariant policy,
            FormatVariant format,
            int spaceShare,
            String exercises) {

        String adminEmail() {
            return "admin." + slug + "@luparx.test";
        }

        String inspectorEmail() {
            return "inspector." + slug + "@luparx.test";
        }
    }

    /**
     * A parking zone of the fixture.
     *
     * @param code         stable code of the zone inside its municipality
     * @param name         name a driver would actually say out loud
     * @param description  short free text shown to citizens and inspectors
     * @param districtCode official district code this zone sits in; resolved against V9_1/V9_2/V13_0
     * @param share        weight of this zone in its municipality's bay code range
     * @param hourlyMajor  hourly tariff in MAJOR units of the municipality's own currency
     */
    record ZoneSeed(String code, String name, String description, String districtCode, int share,
                    long hourlyMajor) {
    }

    /**
     * A charging timetable to write for a municipality.
     *
     * @param chargesAllDay charge around the clock; the bands are then irrelevant
     * @param weekdays      days that carry a band; a day left out is a day that is not charged
     * @param startMinute   band start, local minutes from midnight
     * @param endMinute     band end, local minutes from midnight
     * @param holidays      dated exceptions on which nothing is charged
     */
    record ScheduleVariant(boolean chargesAllDay, List<DayOfWeek> weekdays, int startMinute, int endMinute,
                           List<HolidaySeed> holidays) {
    }

    /** A public holiday: the date it falls on and the name an operator would recognise. */
    record HolidaySeed(LocalDate date, String label) {
    }

    /** A parking policy to write for a municipality; the fields are those of {@code parking_policies}. */
    record PolicyVariant(
            List<Integer> sessionIncrements,
            int sessionMinMinutes,
            int sessionMaxMinutes,
            boolean extensionEnabled,
            List<Integer> extensionIncrements,
            int extensionMaxTotalMinutes,
            boolean earlyFinishEnabled,
            boolean creditOnEarlyFinishEnabled,
            int creditMinRemainingMinutes,
            int creditExpiryDays,
            int graceMinutes) {
    }

    /** A bay code format to write for a municipality. */
    record FormatVariant(String prefix, int digits, boolean allowLetters) {
    }
}
