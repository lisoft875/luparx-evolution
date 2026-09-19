import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import { AmountText, Card, ChipGroup, EmptyState, IconTopUp, ListRow } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import {
  MOVEMENT_ICON,
  MOVEMENT_ICON_TONE,
  MOVEMENT_TITLE_KEY,
  filterMovements,
  type MovementFilter,
} from '../lib/movementPresentation';
import { useTenantTimeZone, useWallet } from '../lib/queries';

export function MovementsPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MovementFilter>('all');
  const { data: wallet } = useWallet();
  const timeZone = useTenantTimeZone();

  // The tenant wallet is the citizen's ledger (CONTRACT.md v0.2 rule 6): one balance and one list
  // of movements per municipality. Filtering happens on what the server already sent.
  const movements = useMemo(() => filterMovements(wallet?.transactions ?? [], filter), [wallet, filter]);

  return (
    <CitizenShell title={t('citizen.movements.title')} onBack={() => navigate('/wallet')}>
      <ChipGroup
        aria-label={t('citizen.movements.title')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('citizen.movements.filter.all') },
          { value: 'parking', label: t('citizen.movements.filter.parking') },
          { value: 'topups', label: t('citizen.movements.filter.topups') },
          { value: 'fines', label: t('citizen.movements.filter.fines') },
        ]}
      />
      {movements.length === 0 ? (
        <Card>
          <EmptyState icon={<IconTopUp size={28} />} title={t('citizen.movements.empty.title')} description={t('citizen.movements.empty.description')} />
        </Card>
      ) : (
        <Card>
          {movements.map((movement) => (
            <ListRow
              key={movement.id}
              icon={MOVEMENT_ICON[movement.type]}
              iconTone={MOVEMENT_ICON_TONE[movement.type]}
              title={t(MOVEMENT_TITLE_KEY[movement.type])}
              meta={
                <>
                  <span className="lx-list-row__meta-line">
                    {formatDateTime(movement.createdAt, locale, { timeZone })}
                  </span>
                  {movement.reference ? (
                    <span className="lx-list-row__meta-line">{movement.reference}</span>
                  ) : null}
                  {/*
                    El saldo que quedó DESPUÉS de este movimiento. Es el dato que se busca al
                    revisar la lista —«¿de dónde salió este número?»— y el único que el servidor
                    manda y la fila no mostraba.

                    La auditoría pedía abrir un detalle por movimiento con referencia, zona,
                    vehículo y método. No se hace: esos campos NO existen —`WalletTransaction` sólo
                    trae id, tipo, monto, saldo posterior, referencia y fecha— y no hay endpoint de
                    detalle. Una pantalla que repitiera lo que ya está en la fila sería un toque
                    extra a cambio de nada. Queda anotado como cambio de contrato.
                  */}
                  <span className="lx-list-row__meta-line">
                    {t('citizen.movements.balanceAfter', {
                      amount: formatCurrencyMinor(
                        movement.balanceAfterMinor,
                        movement.currencyCode,
                        locale,
                      ),
                    })}
                  </span>
                </>
              }
              value={
                <AmountText
                  amountMinor={movement.amountMinor}
                  currencyCode={movement.currencyCode}
                  locale={locale}
                />
              }
            />
          ))}
        </Card>
      )}
    </CitizenShell>
  );
}
