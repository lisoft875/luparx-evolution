import * as React from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@luparx/i18n';
import {
  Card,
  CardStack,
  FormField,
  IconCheck,
  IconChevronRight,
  IconEye,
  Input,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { CitizenDiagnostic } from '../components/CitizenDiagnostic';
import { CitizenDevicePermissions } from '../components/CitizenDevicePermissions';
import {
  CATEGORIAS,
  clavesOpcion,
  plano,
  tituloCategoria,
  type ClaveCategoria,
} from '../lib/helpCenter';
import { ICONOS_CATEGORIA } from '../lib/helpIcons';

/**
 * El Centro de Ayuda del ciudadano: primer nivel.
 *
 * <h2>Qué cambió el 07-10-2026, y por qué no alcanzaba con enlazar las tarjetas</h2>
 *
 * <p>Esta pantalla fue tres cosas en dos días. Primero seis párrafos que no llevaban a ninguna
 * parte; después —esa misma mañana— seis tarjetas que llevaban cada una a su módulo. Lo segundo
 * arregló el defecto que se había reportado y creó otro que se ve de un golpe en la captura del
 * encargo siguiente: <b>una Ayuda cuyos seis botones son los cinco módulos de la barra de abajo es
 * un segundo menú</b>, y un segundo menú no ayuda a nadie que no sepa ya a dónde ir.</p>
 *
 * <p>Ahora la pantalla pregunta primero, como la gente pregunta: no «¿a qué módulo querés entrar?»
 * sino «¿qué necesitás resolver?». Cinco categorías de PROBLEMA, no de módulo, y el módulo aparece
 * recién al final, cuando ya se eligió qué resolver. Es la diferencia entre un directorio y un
 * mostrador de información.</p>
 *
 * <h2>El buscador</h2>
 *
 * <p>Filtra las veintitrés opciones del centro por su texto, acá en el navegador. No llama a
 * ningún servicio y no busca placas ni boletas: no existe un endpoint de búsqueda, y un campo que
 * acepta una placa y no encuentra nada es peor que uno que dice honestamente qué sabe buscar.</p>
 */

export function HelpPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [consulta, setConsulta] = useState('');
  const [verDiagnostico, setVerDiagnostico] = useState(false);
  const [verPermisos, setVerPermisos] = useState(false);

  /** Las opciones que coinciden con lo escrito, con su categoría a cuestas para poder llevar ahí. */
  const coincidencias = useMemo(() => {
    const aguja = plano(consulta.trim());
    if (aguja === '') return [];
    const encontradas: { categoria: ClaveCategoria; clave: string; titulo: string }[] = [];
    for (const categoria of CATEGORIAS) {
      for (const opcion of categoria.opciones) {
        const titulo = t(clavesOpcion(categoria.clave, opcion.clave).title);
        if (plano(titulo).includes(aguja)) {
          encontradas.push({ categoria: categoria.clave, clave: opcion.clave, titulo });
        }
      }
    }
    return encontradas;
  }, [consulta, t]);

  const buscando = consulta.trim() !== '';

  return (
    <CitizenShell title={t('citizen.help.title')} onBack={() => navigate('/more')}>
      <CardStack>
        <Card>
          <p className="lx-text-screen-title" style={{ margin: '0 0 var(--lx-space-3)' }}>
            {t('citizen.help.ask')}
          </p>
          <FormField label={t('citizen.help.search.label')} htmlFor="buscar-ayuda">
            <Input
              id="buscar-ayuda"
              type="search"
              value={consulta}
              placeholder={t('citizen.help.search.placeholder')}
              onChange={(evento) => setConsulta(evento.target.value)}
            />
          </FormField>
        </Card>

        {/* Buscando, las categorías dejan sitio a lo encontrado: dos listas a la vez obligarían a
            leer cuál de las dos contesta lo que se escribió. */}
        {buscando ? (
          coincidencias.length === 0 ? (
            <Card>
              <p className="lx-text-meta" style={{ margin: 0 }}>
                {t('citizen.help.search.empty', { query: consulta.trim() })}
              </p>
            </Card>
          ) : (
            coincidencias.map((hallazgo) => (
              <Card key={`${hallazgo.categoria}.${hallazgo.clave}`}>
                <button
                  type="button"
                  className="lx-help-card"
                  onClick={() => navigate(`/help/${hallazgo.categoria}`)}
                >
                  <span className="lx-help-card__icon" aria-hidden="true">
                    {ICONOS_CATEGORIA[hallazgo.categoria]}
                  </span>
                  <span className="lx-help-card__text">
                    <span className="lx-help-card__title">{hallazgo.titulo}</span>
                    <span className="lx-text-meta">{t(tituloCategoria(hallazgo.categoria))}</span>
                    <span className="lx-help-card__action">
                      {t('citizen.help.search.go')}
                      <span className="lx-help-card__go" aria-hidden="true">
                        <IconChevronRight size={14} />
                      </span>
                    </span>
                  </span>
                </button>
              </Card>
            ))
          )
        ) : (
          <>
            <p className="lx-text-meta" style={{ margin: 0 }}>
              {t('citizen.help.whatDoYouNeed')}
            </p>
            {/* Las categorías NO traen su explicación: el encargo lo pide en letra —«icono, título
                corto, icono de dirección»— y tiene razón. Un párrafo bajo cada una convierte la
                pantalla en algo que hay que leer entero antes de decidir. La explicación aparece
                después, cuando ya se eligió por dónde. */}
            {CATEGORIAS.map((categoria) => (
              <Card key={categoria.clave}>
                <button
                  type="button"
                  className="lx-help-card lx-help-card--compact"
                  data-categoria={categoria.clave}
                  onClick={() => navigate(`/help/${categoria.clave}`)}
                >
                  <span className="lx-help-card__icon" aria-hidden="true">
                    {ICONOS_CATEGORIA[categoria.clave]}
                  </span>
                  <span className="lx-help-card__text">
                    <span className="lx-help-card__title">{t(tituloCategoria(categoria.clave))}</span>
                  </span>
                  <span className="lx-help-card__go" aria-hidden="true">
                    <IconChevronRight size={18} />
                  </span>
                </button>
              </Card>
            ))}

            {/* Permisos del dispositivo, junto al estado y no entre las categorías: las cinco de
                arriba son PROBLEMAS que resolver («no puedo pagar»), y esto es el aparato. Va
                antes del estado porque es más específico —una pregunta concreta sobre la cámara—
                y el estado es el cajón de lo que no entró en ninguna otra parte. */}
            <Card>
              <button
                type="button"
                className="lx-help-card"
                data-categoria="permisos"
                onClick={() => setVerPermisos(true)}
              >
                <span className="lx-help-card__icon" aria-hidden="true">
                  <IconEye />
                </span>
                <span className="lx-help-card__text">
                  <span className="lx-help-card__title">{t('citizen.help.permissions.title')}</span>
                  <span className="lx-text-meta">{t('citizen.help.permissions.body')}</span>
                  <span className="lx-help-card__action">
                    {t('citizen.help.permissions.action')}
                    <span className="lx-help-card__go" aria-hidden="true">
                      <IconChevronRight size={14} />
                    </span>
                  </span>
                </span>
              </button>
            </Card>

            {/* El estado, al final: es lo que se mira cuando nada de lo de arriba aplica. */}
            <Card>
              <button
                type="button"
                className="lx-help-card"
                data-categoria="estado"
                onClick={() => setVerDiagnostico(true)}
              >
                <span className="lx-help-card__icon" aria-hidden="true">
                  <IconCheck />
                </span>
                <span className="lx-help-card__text">
                  <span className="lx-help-card__title">{t('citizen.help.status.title')}</span>
                  <span className="lx-text-meta">{t('citizen.help.status.body')}</span>
                  <span className="lx-help-card__action">
                    {t('citizen.help.status.action')}
                    <span className="lx-help-card__go" aria-hidden="true">
                      <IconChevronRight size={14} />
                    </span>
                  </span>
                </span>
              </button>
            </Card>
          </>
        )}
      </CardStack>

      <CitizenDiagnostic open={verDiagnostico} onClose={() => setVerDiagnostico(false)} />
      <CitizenDevicePermissions open={verPermisos} onClose={() => setVerPermisos(false)} />
    </CitizenShell>
  );
}
