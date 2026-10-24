import * as React from 'react';
import { useState } from 'react';
import { RequirePermission } from '@luparx/auth';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Card, FormField, SectionHeader, Select, Textarea } from '@luparx/ui';
import { AdminShell } from '../components/AdminShell';
import { useAdminZones, useReplaceZoneGeometry, useReviewZoneGeometry, useZoneGeometry } from '../lib/queries';
import { validarGeoJsonZona, type ResultadoValidacion } from '../lib/geojsonZona';

/**
 * Cargar el perímetro oficial de una zona (Fase 5).
 *
 * <p>El mecanismo existía en la API (PUT geometry + PUT review) pero no había pantalla: cargar un
 * perímetro exigía dos llamadas HTTP con token de administrador. Esto lo hace operable. No es un
 * editor de dibujo: recibe el GeoJSON ya trazado (del acuerdo municipal o la capa GIS exportada),
 * lo valida —en especial el error caro de invertir lon/lat— y lo guarda; verificarlo es un segundo
 * paso con su propio permiso, y una geometría DEMO no puede aprobarse.</p>
 */
export function ZonePerimeterPage(): React.JSX.Element {
  const { t } = useTranslation();
  const zones = useAdminZones();
  const [zoneId, setZoneId] = useState<string>('');
  const geometria = useZoneGeometry(zoneId || null);
  const replace = useReplaceZoneGeometry(zoneId || null);
  const review = useReviewZoneGeometry(zoneId || null);
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoValidacion | null>(null);
  const [guardado, setGuardado] = useState(false);

  const zoneOptions = [
    { value: '', label: t('admin.zoneGeometry.selectZonePlaceholder') },
    ...(zones.data ?? []).map((zone) => ({ value: zone.id, label: `${zone.code} · ${zone.name}` })),
  ];

  const validar = (): void => {
    setResultado(validarGeoJsonZona(texto));
    setGuardado(false);
  };

  const guardar = (): void => {
    if (!resultado?.ok || !zoneId) return;
    replace.mutate(resultado.geometry, {
      onSuccess: () => {
        setGuardado(true);
        void geometria.refetch();
      },
    });
  };

  const verificar = (): void => {
    if (!zoneId) return;
    review.mutate({ decision: 'VERIFIED', source: 'MUNICIPAL_OFFICIAL' });
  };

  return (
    <AdminShell>
      <SectionHeader title={t('admin.zoneGeometry.title')} description={t('admin.zoneGeometry.description')} />

      <Card>
        <FormField label={t('admin.zoneGeometry.selectZone')}>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={zoneId}
              onChange={(value) => {
                setZoneId(value);
                setResultado(null);
                setGuardado(false);
              }}
              options={zoneOptions}
            />
          )}
        </FormField>
        {zoneId ? (
          <p className="lx-text-meta">
            {geometria.isLoading
              ? t('common.loading')
              : geometria.data
                ? t('admin.zoneGeometry.current')
                : t('admin.zoneGeometry.currentNone')}
          </p>
        ) : null}
      </Card>

      {zoneId ? (
        <Card>
          <FormField label={t('admin.zoneGeometry.paste')}>
            {({ inputId }) => (
              <Textarea
                id={inputId}
                rows={8}
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                placeholder='{"type":"Polygon","coordinates":[[[-84.079,9.9345],...]]}'
              />
            )}
          </FormField>
          <div style={{ display: 'flex', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={validar} disabled={!texto.trim()}>
              {t('admin.zoneGeometry.validate')}
            </Button>
            <Button type="button" onClick={guardar} disabled={!resultado?.ok}>
              {t('admin.zoneGeometry.save')}
            </Button>
          </div>

          {resultado && !resultado.ok ? <Alert tone="danger">{resultado.error}</Alert> : null}
          {resultado?.ok ? (
            <Alert tone={resultado.resumen.dentroDeCostaRica ? 'info' : 'warning'}>
              <div className="flex flex-col gap-1">
                <span>
                  {t('admin.zoneGeometry.valid')}: {resultado.resumen.tipo} · {resultado.resumen.anillos} ·{' '}
                  {resultado.resumen.vertices}
                </span>
                <span className="lx-text-meta">
                  O {resultado.resumen.oeste.toFixed(4)} · S {resultado.resumen.sur.toFixed(4)} · E{' '}
                  {resultado.resumen.este.toFixed(4)} · N {resultado.resumen.norte.toFixed(4)}
                </span>
                {!resultado.resumen.dentroDeCostaRica ? <span>{t('admin.zoneGeometry.outsideCR')}</span> : null}
              </div>
            </Alert>
          ) : null}
          {replace.isError ? <Alert tone="danger">{t('admin.zoneGeometry.error.generic')}</Alert> : null}

          {guardado ? (
            <div className="flex flex-col gap-2">
              <Alert tone="success">{t('admin.zoneGeometry.saved')}</Alert>
              <RequirePermission permission="ZONE_GEOMETRY_VERIFY">
                <p className="lx-text-meta">{t('admin.zoneGeometry.verifyHint')}</p>
                <Button type="button" onClick={verificar}>
                  {t('admin.zoneGeometry.verify')}
                </Button>
                {review.isSuccess ? <Alert tone="success">{t('admin.zoneGeometry.verified')}</Alert> : null}
                {review.isError ? <Alert tone="danger">{t('admin.zoneGeometry.error.verify')}</Alert> : null}
              </RequirePermission>
            </div>
          ) : null}
        </Card>
      ) : null}
    </AdminShell>
  );
}
