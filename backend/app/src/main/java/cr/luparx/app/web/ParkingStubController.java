package cr.luparx.app.web;

import cr.luparx.core.error.NotImplementedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reserved parking-domain routes (CONTRACT.md §4 "Dominio parquímetros (stub v0.1, contrato
 * reservado)").
 *
 * <p>They are published so the contract surface is visible in OpenAPI and so no other module
 * accidentally claims these paths, and they answer {@code 501 NOT_IMPLEMENTED} rather than 404: a
 * client can tell "declared but not built yet" from "wrong URL". The real implementations arrive in
 * module-parking (see {@code backend/module-parking/README.md}).</p>
 *
 * <p>Authentication and portal isolation already apply here — these paths sit under the portal
 * security chains — so the stubs cannot be used to probe the API anonymously.</p>
 *
 * <p><b>Shrunk in v0.2.</b> Vehicles, parking sessions, zones and tariffs are implemented now
 * ({@code CitizenVehicleController}, {@code CitizenParkingController}, {@code AdminParkingController})
 * and their stubs were removed rather than left alongside the real routes: two handlers claiming the
 * same path is an ambiguous mapping, and a {@code /**} stub next to a concrete route is a trap. What
 * remains here is what is genuinely still unbuilt — patrols, citations and municipal finance.</p>
 */
@RestController
@Tag(name = "Parking (reserved)", description = "Declared but not implemented in v0.1; every route "
        + "answers 501 with code NOT_IMPLEMENTED.")
public class ParkingStubController {

    @RequestMapping("/api/v1/inspector/patrols/**")
    @Operation(summary = "Inspector patrols — reserved, not implemented in v0.1")
    public void inspectorPatrols() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

    @RequestMapping("/api/v1/inspector/citations/**")
    @Operation(summary = "Inspector citations — reserved, not implemented in v0.1")
    public void inspectorCitations() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

    @RequestMapping("/api/v1/admin/finance/**")
    @Operation(summary = "Municipal finance — reserved, not implemented in v0.1")
    public void adminFinance() {
        throw new NotImplementedException("error.notImplemented.parking");
    }
}
