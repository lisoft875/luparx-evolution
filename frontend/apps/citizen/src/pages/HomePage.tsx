import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, formatCurrencyMinor, formatDateTime, formatTime } from '@luparx/i18n';
import {
  AmountText,
  BRAND_ASSETS,
  Button,
  Card,
  HeroCard,
  IconCar,
  IconChevronRight,
  IconCheck,
  IconFine,
  IconPark,
  IconPlus,
  IconWallet,
  ListRow,
  SectionHeader,
  StatCard,
  Timer,
} from '@luparx/ui';
import type { ParkingPolicy, ParkingSession, Vehicle } from '@luparx/api-client';
import { BalanceRow } from '../components/BalanceRow';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { ExtendSessionSheet } from '../components/ExtendSessionSheet';
import { FinishSessionConfirm } from '../components/FinishSessionConfirm';
import { MOVEMENT_ICON, MOVEMENT_TITLE_KEY } from '../lib/movementPresentation';
import { resumenPorPagar } from '../lib/fineStatus';
import { cardToneFor, urgencyMessageKey, urgencyOf } from '../lib/sessionUrgency';
import { useAuth } from '@luparx/auth';
import {
  useActiveParkingSessions,
  useParkingPolicy,
  useTenantTimeZone,
  useFines,
  useVehicles,
  useWallet,
} from '../lib/queries';


function useRemainingSeconds(expiresAt: string): number {
  // Floored, like every other countdown in the app: the number on screen must never be ahead of
  // the time the server will actually honour (see ActiveSessionsBar).
  const compute = (): number => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return remaining;
}

/**
 * Featured active-session card. When the citizen has more than one active session (CONTRACT.md
 * v0.2 rule 1), this shows whichever expires first — same one the sticky bar leads with; the
 * sticky bar's own "+N" list is how the rest are reached. Extend/Finish visibility is driven by
 * the *active* tenant's policy: a session belonging to a different municipality than the one
 * currently selected is a rare edge case this demo doesn't special-case (the server itself always
 * validates against the session's own tenant regardless of what the UI shows).
 */
function ActiveSessionCard({ session, policy }: { session: ParkingSession; policy: ParkingPolicy | undefined }): React.JSX.Element {
  const { t, locale } = useTranslation();
  const timeZone = useTenantTimeZone();
  const remainingSeconds = useRemainingSeconds(session.expiresAt);
  const [extendOpen, setExtendOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  const urgency = urgencyOf(remainingSeconds);
  const urgencyKey = urgencyMessageKey(urgency);

  return (
    // El nivel y su tono salen de `sessionUrgency`, no de un literal acá: el umbral estaba
    // duplicado en tres archivos y una discrepancia dejaba la barra en advertencia con la tarjeta
    // en verde, sin que nadie lo notara.
    <Card tone={cardToneFor(urgency)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-3)' }}>
            <span className="lx-list-row__icon lx-list-row__icon--success" aria-hidden="true">
              <IconCar size={20} />
            </span>
            <p className="lx-text-card-title" style={{ margin: 0 }}>
              {t('citizen.home.activeSession.title')}
            </p>
          </div>
          <span
            className="lx-status-dot"
            role="status"
            // Decía «Activo» para siempre, incluso con el contador en cero: a un lector de
            // pantalla le estaba afirmando lo contrario de lo que pasaba.
            aria-label={t(
              remainingSeconds <= 0
                ? 'citizen.home.activeSession.statusExpired'
                : 'citizen.home.activeSession.statusActive',
            )}
          />
        </div>
        <p className="lx-text-amount-lg" style={{ margin: 0 }}>
          {session.plateSnapshot}
        </p>
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.home.activeSession.zoneAndSpace', { zone: session.zoneName, space: session.spaceCode })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Timer
            remainingSeconds={remainingSeconds}
            expiredLabel={t('citizen.timer.expired')}
            aria-label={t('citizen.home.activeSession.title')}
          />
          <span className="lx-text-meta">{t('citizen.home.activeSession.remainingLabel')}</span>
          {/*
            El aviso en PALABRAS. Un color más intenso no dice qué hacer, y quien no distingue bien
            los colores —o mira la pantalla al sol— no ve ningún cambio. `aria-live` para que un
            lector de pantalla lo anuncie al cruzar el umbral y no sólo si la persona vuelve a leer.
          */}
          {urgencyKey ? (
            <span
              className="lx-text-meta"
              style={{ color: 'var(--lx-warning)', textAlign: 'center' }}
              aria-live="polite"
            >
              {t(urgencyKey)}
            </span>
          ) : null}
        </div>
        <p className="lx-text-meta" style={{ margin: 0, textAlign: 'center' }}>
          {t('citizen.home.activeSession.expiresAt', {
            time: formatTime(session.expiresAt, locale, { timeZone }),
          })}
        </p>
        {/* `flex: 1` alone (basis 0) put both actions on one line whatever the width, and a flex
            item's default `min-width: auto` will not shrink below its own label — so at 320 and
            390 px "Extender tiempo" and "Finalizar ahora" ran off the right edge of the card and
            gave the whole page a horizontal scrollbar. A basis wide enough to be worth keeping
            side by side, plus wrapping, is what makes the row honest: two columns where they fit,
            two full-width rows on a phone, and never a button hanging off the screen. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--lx-space-2)' }}>
          {policy?.extensionEnabled ? (
            <Button type="button" variant="outline" style={{ flex: '1 1 200px' }} onClick={() => setExtendOpen(true)}>
              <IconPlus size={16} /> {t('citizen.home.activeSession.extendCta')}
            </Button>
          ) : null}
          {policy?.earlyFinishEnabled ? (
            <Button type="button" variant="secondary" style={{ flex: '1 1 200px' }} onClick={() => setFinishOpen(true)}>
              {t('citizen.home.activeSession.finishCta')}
            </Button>
          ) : null}
        </div>
      </div>
      {/* No policy needed: the options, their prices and whether each is allowed all come from
          `GET /sessions/{id}/extension-options`, which knows this stay and not just the rules. */}
      <ExtendSessionSheet open={extendOpen} onClose={() => setExtendOpen(false)} session={session} />
      {policy ? <FinishSessionConfirm open={finishOpen} onClose={() => setFinishOpen(false)} session={session} policy={policy} /> : null}
    </Card>
  );
}

function primaryVehicleOf(vehicles: Vehicle[] | undefined): Vehicle | undefined {
  return vehicles?.find((v) => v.isPrimary) ?? vehicles?.[0];
}

/** Cuántos movimientos entran en la portada. La fachada aprobada dibuja tres. */
const MOVIMIENTOS_EN_PORTADA = 3;

export function HomePage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { data: sessions } = useActiveParkingSessions();
  const { data: policy } = useParkingPolicy();
  const walletQuery = useWallet();
  const vehiclesQuery = useVehicles();
  // La primera página alcanza: la tarjeta dice «tenés N por pagar», y quien tenga más de una
  // página de multas impagas necesita la pantalla completa, no un contador más preciso.
  const finesQuery = useFines(0, 20);
  const { me } = useAuth();
  const timeZone = useTenantTimeZone();

  const session = [...(sessions ?? [])].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )[0];

  return (
    <CitizenShell>
      {/*
        El héroe: saludo a la izquierda, imagen fundida al fondo derecho (09-10-2026).

        La fachada aprobada lo pide «integrado, no banner separado», y por eso la imagen NO es un
        `<img>` al lado del texto sino el fondo del propio bloque, con dos degradados navy encima
        —uno horizontal que protege el saludo y otro vertical que funde el pie con lo que sigue—.
        Así no hay ningún borde de foto en ninguna parte, que es literalmente lo que el punto 10
        dice no aceptar.

        Sobre la imagen, y hay que decirlo claro: el único activo de héroe que el proyecto tiene es
        la marca de neón sobre negro (`heroCitizenBg`, el recorte que `AuthScreen` ya usa de fondo).
        NO es una fotografía automotriz. El encargo prevé exactamente este caso —«si no existe
        asset automotriz aprobado, dejar el contenedor preparado y usar/solicitar un asset del
        proyecto; no descargar imagen aleatoria»— así que se usa el del proyecto y el contenedor
        queda listo: cambiar la foto es cambiar esta constante y nada más.
      */}
      <header className="lx-citizen-hero">
        <div
          className="lx-citizen-hero__photo"
          style={{ backgroundImage: `url(${BRAND_ASSETS.heroCitizenBg})` }}
          aria-hidden="true"
        />
        <h1 className="lx-citizen-hero__greeting">
          {t('citizen.home.greeting', { name: me?.user.givenName ?? '' })}
        </h1>
        <p className="lx-citizen-hero__lead">
          {session ? t('citizen.home.subtitle.activeSession') : t('citizen.home.subtitle.noSession')}
        </p>
      </header>

      {session ? (
        <ActiveSessionCard session={session} policy={policy} />
      ) : (
        <HeroCard
          className="lx-hero-card--citizen"
          icon={<IconPark size={28} />}
          title={t('citizen.home.cta.title')}
          subtitle={t('citizen.home.cta.subtitle')}
          onClick={() => navigate('/park')}
        />
      )}

      {session ? (
        // Mockup screen 2: only the balance row repeats here (no vehicle card) once a session is active.
        <QueryBoundary query={walletQuery} errorTitle={t('citizen.wallet.balanceLabel')}>
          {(wallet) => (
            <BalanceRow
              label={t('citizen.wallet.balanceLabel')}
              balanceMinor={wallet.balanceMinor}
              currencyCode={wallet.currencyCode}
              locale={locale}
              actionLabel={t('citizen.home.balanceCard.action')}
              onAction={() => navigate('/wallet')}
            />
          )}
        </QueryBoundary>
      ) : (
        // Each card owns its own three outcomes. They used to fall back to "Cargando…" for any
        // absent value, which turned a failed wallet call and a citizen with no car into the same
        // permanent spinner; now a failure states itself and offers the retry, and "no vehicles
        // yet" says so and offers the way to add one.
        <div className="lx-grid-2 lx-citizen-pair" style={{ gap: 'var(--lx-card-gap)' }}>
          <QueryBoundary
            query={walletQuery}
            errorTitle={t('citizen.wallet.balanceLabel')}
            loading={
              <StatCard
                className="lx-stat-card--compact"
                icon={<IconWallet size={20} />}
                label={t('citizen.wallet.balanceLabel')}
                value={t('common.loading')}
              />
            }
          >
            {(wallet) => (
              <StatCard
                className="lx-stat-card--compact"
                /*
                  El icono que faltaba (09-10-2026). La referencia lo dibuja en las dos tarjetas y
                  no estaba: `StatCard` sólo lo pinta si se lo pasan, y acá no se le pasaba. Se
                  veía en la comparación que armé —porque mi réplica lo inventó— y no en staging,
                  que es la diferencia entre un boceto y la pantalla.
                */
                icon={<IconWallet size={20} />}
                label={t('citizen.wallet.balanceLabel')}
                value={formatCurrencyMinor(wallet.balanceMinor, wallet.currencyCode, locale)}
                action={
                  <Button type="button" variant="solid" onClick={() => navigate('/wallet')}>
                    {t('citizen.home.balanceCard.action')}
                  </Button>
                }
              />
            )}
          </QueryBoundary>
          <QueryBoundary
            query={vehiclesQuery}
            errorTitle={t('citizen.home.vehicleCard.label')}
            isEmpty={(list) => list.length === 0}
            loading={
              <StatCard
                className="lx-stat-card--compact"
                icon={<IconCar size={20} />}
                label={t('citizen.home.vehicleCard.label')}
                value={t('common.loading')}
              />
            }
            empty={
              <StatCard
                className="lx-stat-card--compact"
                icon={<IconCar size={20} />}
                label={t('citizen.home.vehicleCard.label')}
                value={t('citizen.home.vehicleCard.empty')}
                action={
                  <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
                    {t('citizen.home.vehicleCard.addCta')}
                  </Button>
                }
              />
            }
          >
            {(vehicles) => {
              const vehicle = primaryVehicleOf(vehicles);
              return (
                <StatCard
                  className="lx-stat-card--compact"
                  icon={<IconCar size={20} />}
                  label={t('citizen.home.vehicleCard.label')}
                  value={vehicle?.plate ?? t('citizen.home.vehicleCard.empty')}
                  hint={vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || undefined : undefined}
                  action={
                    <Button type="button" variant="outline" onClick={() => navigate('/vehicles')}>
                      {t('citizen.home.vehicleCard.changeCta')}
                    </Button>
                  }
                />
              );
            }}
          </QueryBoundary>
        </div>
      )}

      {/*
        Esta tarjeta decía «Ninguna», en verde y con un tic, SIN consultar nada: estaba escrita a
        mano. Alguien con una boleta impaga veía «al día» en la primera pantalla y sólo se enteraba
        entrando a Más → Multas (reportado el 2026-09-19).

        Se cuenta lo que se debe HOY —`resumenPorPagar`, que deja fuera las apeladas— y no lo que
        está «abierto»: una multa bajo apelación no debe nada mientras la municipalidad no resuelva.
        El criterio es el mismo módulo que usa la pantalla de Multas, para que las dos no puedan
        volver a contestar distinto.

        Mientras carga NO se afirma nada. Decir «Ninguna» y corregirlo medio segundo después es
        exactamente el error que esto viene a arreglar, en pequeño.
      */}
      {(() => {
        const deuda = finesQuery.data ? resumenPorPagar(finesQuery.data.items) : null;
        const cargando = finesQuery.isPending;
        const hayDeuda = !!deuda && deuda.cantidad > 0;
        return (
          <Card tone={hayDeuda ? 'warning' : 'success'} className={hayDeuda ? 'lx-citizen-fines' : undefined}>
            <ListRow
              icon={hayDeuda ? <IconFine size={18} /> : <IconCheck size={18} />}
              iconTone={hayDeuda ? 'warning' : 'success'}
              iconShape="circle"
              title={t('citizen.home.finesCard.label')}
              meta={
                <span
                  style={{
                    color: hayDeuda ? 'var(--lx-warning)' : 'var(--lx-success)',
                    fontWeight: 700,
                  }}
                >
                  {cargando
                    ? t('citizen.home.finesCard.loading')
                    : hayDeuda
                      ? deuda.cantidad === 1
                        ? t('citizen.home.finesCard.one')
                        : t('citizen.home.finesCard.many', { count: String(deuda.cantidad) })
                      : t('citizen.home.finesCard.none')}
                </span>
              }
              // `value` y no una segunda línea: va alineado a la derecha, que es donde esta
              // lista pone siempre los montos (DESIGN_SYSTEM.md §3).
              value={
                hayDeuda && deuda.currencyCode ? (
                  /*
                    `sign="charge"` y sin prefijo. Sin el `sign` explícito, `AmountText` lo deduce
                    del número: positivo = ingreso = verde con «+». Y así salía «+₡750 verde» sobre
                    una DEUDA, que es lo contrario de lo que significa (auditoría del 22-09-2026,
                    P0 del Inicio). La regla global del documento: verde es entrada, rojo/ámbar es
                    salida o deuda, y el color nunca se reutiliza al revés.
                  */
                  <AmountText
                    amountMinor={deuda.totalMinor}
                    currencyCode={deuda.currencyCode}
                    locale={locale}
                    sign="charge"
                    showSignPrefix={false}
                  />
                ) : undefined
              }
              onClick={() => navigate('/fines')}
            />
          </Card>
        );
      })()}

      <div>
        <SectionHeader
          title={t('citizen.home.activity.title')}
          action={{ label: t('citizen.home.activity.viewAllCta'), onClick: () => navigate('/movements') }}
        />
        <Card>
          {/* The wallet endpoint returns the balance together with the first page of movements,
              newest first — this row is simply the top of that ledger. */}
          <QueryBoundary
            query={walletQuery}
            errorTitle={t('citizen.home.activity.title')}
            isEmpty={(wallet) => wallet.transactions.length === 0}
            empty={
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('citizen.movements.empty.title')}
              </p>
            }
          >
            {(wallet) => (
              /*
                Tres filas, no una (09-10-2026). La fachada aprobada muestra tres movimientos y
                hasta hoy se dibujaba sólo `transactions[0]` — una lista de un elemento, con su
                encabezado y su «Ver todas», que es más cromo que contenido.

                No cuesta ninguna consulta nueva: `GET /citizen/wallet` ya devuelve el saldo JUNTO
                con la primera página de movimientos, y esta pantalla ya la pedía entera.

                Lo que la referencia dibuja y NO se puede dibujar: «Zona SJ-CENTRO · 2 horas».
                `WalletTransaction` trae id, tipo, monto, saldo posterior, `reference` y fecha — no
                trae zona ni duración. Donde el movimiento tiene `reference` se muestra, que es el
                dato real más cercano; donde no, el renglón no existe en vez de inventarse.
              */
              <div className="lx-citizen-activity">
                {wallet.transactions.slice(0, MOVIMIENTOS_EN_PORTADA).map((movimiento) => (
                  <button
                    key={movimiento.id}
                    type="button"
                    className="lx-citizen-activity__row"
                    onClick={() => navigate('/movements')}
                  >
                    <span className="lx-citizen-badge" aria-hidden="true">
                      {MOVEMENT_ICON[movimiento.type]}
                    </span>
                    <span className="lx-citizen-activity__what">
                      <span className="lx-citizen-activity__title">
                        {t(MOVEMENT_TITLE_KEY[movimiento.type])}
                      </span>
                      <span className="lx-citizen-activity__when">
                        {formatDateTime(movimiento.createdAt, locale, { timeZone })}
                      </span>
                      {movimiento.reference ? (
                        <span className="lx-citizen-activity__where">{movimiento.reference}</span>
                      ) : null}
                    </span>
                    <AmountText
                      amountMinor={movimiento.amountMinor}
                      currencyCode={movimiento.currencyCode}
                      locale={locale}
                    />
                    <IconChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </QueryBoundary>
        </Card>
      </div>
    </CitizenShell>
  );
}
