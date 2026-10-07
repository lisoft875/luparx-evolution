import * as React from 'react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import { Card, CardStack, IconChevronRight } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { CitizenDiagnostic } from '../components/CitizenDiagnostic';
import { categoriaPorClave, clavesOpcion, tituloCategoria, type AccionAyuda } from '../lib/helpCenter';
import { ICONOS_CATEGORIA } from '../lib/helpIcons';

/**
 * El Centro de Ayuda: segundo nivel. «¿Qué necesitás resolver?».
 *
 * <h2>Por qué es una ruta y no una sección que se abre</h2>
 *
 * <p>Porque así la flecha de volver, el «Atrás» del navegador y el enlace que alguien le pasa a
 * otro funcionan sin una sola línea de código. Una sección dentro de la misma pantalla habría
 * obligado a interceptar el botón del navegador para que no saliera de Ayuda — código nuevo para
 * reimplementar peor algo que el enrutador ya hace. Es una subruta dentro de Ayuda, no un módulo
 * nuevo: ninguno de los cinco módulos de la barra de abajo cambió.</p>
 *
 * <h2>El orden, que es el encargo entero</h2>
 *
 * <p>PROBLEMA → OPCIÓN → EXPLICACIÓN → ACCIÓN. La explicación va ARRIBA del botón y no dentro: un
 * botón con un párrafo adentro no se lee como un botón. Y el botón aparece sólo cuando hay una
 * función de verdad detrás; si no la hay, la opción explica y se queda ahí, que es más honesto que
 * un control que no hace nada.</p>
 */
export function HelpCategoryPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { categoria: clave } = useParams();
  const [verDiagnostico, setVerDiagnostico] = useState(false);

  const categoria = categoriaPorClave(clave);
  // Una categoría inventada en la barra de direcciones vuelve al centro, no a una pantalla vacía.
  if (!categoria) return <Navigate to="/help" replace />;

  function ejecutar(accion: AccionAyuda): void {
    if (accion.tipo === 'ruta') navigate(accion.a);
    else if (accion.tipo === 'diagnostico') setVerDiagnostico(true);
    else window.location.reload();
  }

  return (
    <CitizenShell title={t(tituloCategoria(categoria.clave))} onBack={() => navigate('/help')}>
      <CardStack>
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {categoria.clave === 'app' ? t('citizen.help.whatIsHappening') : t('citizen.help.whatToSolve')}
        </p>
        {categoria.opciones.map((opcion) => {
          const claves = clavesOpcion(categoria.clave, opcion.clave);
          return (
            <Card key={opcion.clave}>
              {opcion.accion ? (
                <button
                  type="button"
                  className="lx-help-card"
                  data-opcion={opcion.clave}
                  onClick={() => ejecutar(opcion.accion as AccionAyuda)}
                >
                  <span className="lx-help-card__icon" aria-hidden="true">
                    {ICONOS_CATEGORIA[categoria.clave]}
                  </span>
                  <span className="lx-help-card__text">
                    <span className="lx-help-card__title">{t(claves.title)}</span>
                    <span className="lx-text-meta">{t(claves.body)}</span>
                    <span className="lx-help-card__action">
                      {t(claves.action)}
                      <span className="lx-help-card__go" aria-hidden="true">
                        <IconChevronRight size={14} />
                      </span>
                    </span>
                  </span>
                </button>
              ) : (
                /* Sin función detrás: explica y no finge. Hoy no hay ninguna así, y la rama existe
                   para que la primera que aparezca no tenga que inventarse un destino. */
                <div className="lx-help-card lx-help-card--static">
                  <span className="lx-help-card__icon" aria-hidden="true">
                    {ICONOS_CATEGORIA[categoria.clave]}
                  </span>
                  <span className="lx-help-card__text">
                    <span className="lx-help-card__title">{t(claves.title)}</span>
                    <span className="lx-text-meta">{t(claves.body)}</span>
                  </span>
                </div>
              )}
            </Card>
          );
        })}
      </CardStack>

      <CitizenDiagnostic open={verDiagnostico} onClose={() => setVerDiagnostico(false)} />
    </CitizenShell>
  );
}
