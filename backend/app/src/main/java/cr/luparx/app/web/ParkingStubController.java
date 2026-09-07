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
 */
@RestController
@Tag(name = "Parking (reserved)", description = "Declared but not implemented in v0.1; every route "
        + "answers 501 with code NOT_IMPLEMENTED.")
public class ParkingStubController {

    @RequestMapping("/api/v1/citizen/vehicles/**")
    @Operation(summary = "Citizen vehicles — reserved, not implemented in v0.1")
    public void citizenVehicles() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

    @RequestMapping("/api/v1/citizen/parking-sessions/**")
    @Operation(summary = "Citizen parking sessions — reserved, not implemented in v0.1")
    public void citizenParkingSessions() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

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

    @RequestMapping("/api/v1/admin/zones/**")
    @Operation(summary = "Municipal zones — reserved, not implemented in v0.1")
    public void adminZones() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

    @RequestMapping("/api/v1/admin/rates/**")
    @Operation(summary = "Municipal rates — reserved, not implemented in v0.1")
    public void adminRates() {
        throw new NotImplementedException("error.notImplemented.parking");
    }

    @RequestMapping("/api/v1/admin/finance/**")
    @Operation(summary = "Municipal finance — reserved, not implemented in v0.1")
    public void adminFinance() {
        throw new NotImplementedException("error.notImplemented.parking");
    }
}
