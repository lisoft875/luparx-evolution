# LupaRX — Cobrar con tarjeta en desarrollo

> Cómo correr un pago con tarjeta de principio a fin sin contrato con ninguna pasarela.
> Decisiones y razones: [ADR 0023](adr/0023-payment-gateway-port.md). Modelo de pagos:
> [ADR 0019](adr/0019-payments-and-reconciliation.md).

## Qué es el proveedor `SIMULATED`

Un adaptador que implementa el mismo puerto que va a implementar la pasarela real
(`cr.luparx.billing.port.PaymentGateway`) y ejerce **todo** el camino de producción: redirección a una
página de cobro en otra URL, tarjetas de prueba con resultados deterministas, reto 3-D Secure,
retorno **sin resultado en la URL**, y notificación firmada de vuelta al webhook.

No es un atajo. No existe ningún `if (dev) acreditarBilletera()`.

Sólo se registra bajo el perfil `dev`. Fuera de `dev` el bean no existe pase lo que pase en la
configuración, y la plataforma reporta «sin pasarela» en vez de aparentar tener una.

## Arrancar

```bash
cd infra && docker compose up -d          # Postgres 5442, Mailpit 1035/8035
cd ../backend && SPRING_PROFILES_ACTIVE=dev mvn -pl app -am spring-boot:run
```

Comprobación rápida de que el simulador está cableado (debe decir `SIMULATED`):

```bash
curl -s localhost:8090/api/v1/citizen/wallet/card-payments \
  -H "Authorization: Bearer $CITIZEN_TOKEN" -H "X-Tenant-Id: $TENANT_ID" | jq
```

## El recorrido

```
  ciudadano                    LupaRX                     proveedor (simulado)
      │                           │                                │
      │  POST /checkouts          │                                │
      ├──────────────────────────►│  1. Payment PENDING            │
      │                           ├───────────────────────────────►│ 2. abre el cobro
      │                           │◄───────────────────────────────┤    referencia + URL
      │  303 → redirectUrl        │  3. PaymentCheckout OPEN       │
      │◄──────────────────────────┤                                │
      │                                                            │
      ├───────────────── digita la tarjeta ───────────────────────►│ 4. decide por el número
      │                                                            │
      │◄──────── 303 al portal, con SÓLO un token ─────────────────┤
      │                           │                                │
      │                           │◄─── 5. notificación firmada ───┤
      │  POST /checkouts/return   │                                │
      ├──────────────────────────►│  6. ¿qué pasó de verdad? ─────►│
      │                           │◄─────── CAPTURED ──────────────┤
      │◄──── saldo acreditado ────┤  7. billetera + capture, una transacción
```

Los pasos 5 y 6 son la regla central: **el webhook avisa, el proveedor confirma**. El retorno del
paso 6 hace exactamente lo mismo que la notificación del paso 5 — consultar y actuar — y por eso da
igual cuál llegue primero, o si una de las dos se pierde.

## Las tarjetas de prueba

| Número | Qué hace |
|---|---|
| `4111 1111 1111 1111` | Aprobada (Visa) |
| `5555 5555 5555 4444` | Aprobada (Mastercard) |
| `4000 0000 0000 0002` | Rechazada por el emisor |
| `4000 0000 0000 9995` | Fondos insuficientes |
| `4000 0000 0000 3220` | Pide autenticación 3-D Secure y luego aprueba |
| `4000 0000 0000 0069` | Tarjeta vencida |

El resultado sale del **número**, no del monto, igual que en el sandbox de cualquier proveedor real.
Cualquier número que no esté en la lista se aprueba, para que una demostración no se trabe con un dedo.

## Los cuatro escenarios que hay que probar antes de creerle

1. **Pago exitoso.** Tarjeta aprobada → volver → el saldo subió, `payments.status = CAPTURED`,
   `wallet_transactions` tiene el movimiento con su `payment_id`.
2. **Pago rechazado.** Tarjeta rechazada → volver → el saldo **no** cambió y **queda fila**:
   `payments.status = FAILED` con `failure_code`. Esto es lo que se le enseña al ciudadano que dice
   «yo pagué».
3. **Abandono.** Abrir el checkout y **cerrar la pestaña**. A los 20 minutos (`checkout-ttl`)
   `PendingCheckoutSweepJob` le pregunta al proveedor una última vez y cierra el intento como
   `CANCELLED`. No queda nada colgado en la lista del tesorero.
4. **El caso que justifica el job.** Pagar con tarjeta aprobada y **cerrar la pestaña antes de volver**.
   Sin retorno, la notificación es lo único que hay; apagá el backend un momento para que tampoco
   llegue. Al levantarlo, el barrido encuentra el traspaso abierto, le pregunta al proveedor, y
   **acredita sin que nadie llame a la municipalidad**. Se ve en el log:
   `Sweep credited payment … that no return and no notification had resolved.`

## Probar que el webhook no se deja engañar

Es la única ruta no autenticada que puede terminar moviendo plata, así que vale probarla a mano.

```bash
# Sin firma: 400, y queda guardada como evidencia con signature_verified = false
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  localhost:8090/api/v1/webhooks/payments/SIMULATED \
  -H 'Content-Type: application/json' \
  -d '{"reference":"SIM-CUALQUIERA","outcome":"CAPTURED"}'
```

Lo que hay que comprobar en la base después:

```sql
select provider, provider_event_id, signature_verified, processed_at, processing_error
from payment_gateway_notifications order by received_at desc limit 5;
```

Una notificación sin firma válida **se guarda y no se procesa** — la base lo obliga
(`ck_gateway_notifications_unverified_unprocessed`), no sólo el código. Y un cuerpo repetido se
rechaza por índice único, así que los reintentos del proveedor son gratis.

## Lo que NO se puede hacer, por diseño

- **Acreditar saldo desde la URL de retorno.** No acepta ningún resultado; sólo un token. Probalo:
  inventá un `?token=` y mirá que responda igual que un token inexistente.
- **Mandar el número de tarjeta al backend.** No hay ningún campo para eso en ningún DTO, y no debe
  haberlo: el PAN nunca entra a la plataforma (PCI DSS SAQ A).
- **Cobrar dos veces por dos toques.** Un solo traspaso abierto por persona y municipalidad.

## Cuando llegue la pasarela real

Es una clase nueva que implementa `PaymentGateway`, un `@ConditionalOnProperty` con su nombre, y
`luparx.payments.provider` apuntándole. Nada del dominio cambia. Lo que sí falta resolver en esa
iteración: credenciales **por municipalidad** (decisión 4 del ADR 0019 — cada una recauda en su propia
cuenta), devoluciones y contracargos, y rate limiting delante del webhook.
