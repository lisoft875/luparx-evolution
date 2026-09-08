package cr.luparx.app.web;

import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.service.TimeCreditService;
import cr.luparx.parking.service.WalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * The citizen's money and minutes in the active municipality (CONTRACT.md v0.2, "API").
 *
 * <p>Both are per tenant, and the endpoints say so by construction: the balance returned is the one
 * of {@code TenantContextHolder.requireTenantId()}, and there is no route that would return a total
 * across municipalities, because no such total exists (rule 6).</p>
 */
@RestController
@RequestMapping("/api/v1/citizen")
@Tag(name = "Citizen · Wallet", description = "Balance, movements and minute credits of the active municipality.")
public class CitizenWalletController {

    private final WalletService walletService;
    private final TimeCreditService timeCreditService;
    private final ParkingMapper mapper;

    public CitizenWalletController(WalletService walletService, TimeCreditService timeCreditService,
                                   ParkingMapper mapper) {
        this.walletService = walletService;
        this.timeCreditService = timeCreditService;
        this.mapper = mapper;
    }

    @GetMapping("/wallet")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "My balance and movements in this municipality")
    public ParkingDtos.WalletResponse wallet(@RequestParam(required = false) Integer page,
                                             @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        PageRequest request = PageRequest.parse(page, size, null);
        Money balance = walletService.balance(tenantId, userId);
        PageResponse<WalletTransaction> movements = walletService.listTransactions(tenantId, userId, request);
        return new ParkingDtos.WalletResponse(mapper.toMoney(balance),
                movements.map(mapper::toWalletTransaction));
    }

    @GetMapping("/time-credits")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Minutes to my favour in this municipality, and when they lapse")
    public ParkingDtos.TimeCreditResponse timeCredits() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        // Reading sweeps whatever already expired, so the balance shown is never minutes the citizen
        // can no longer spend.
        int balanceMinutes = timeCreditService.availableMinutes(tenantId, userId);
        List<ParkingTimeCreditEntry> lots = timeCreditService.liveLots(tenantId, userId);
        List<ParkingDtos.TimeCreditLotResponse> mapped = new ArrayList<>(lots.size());
        for (ParkingTimeCreditEntry lot : lots) {
            mapped.add(mapper.toCreditLot(lot));
        }
        return new ParkingDtos.TimeCreditResponse(balanceMinutes, mapped);
    }
}
