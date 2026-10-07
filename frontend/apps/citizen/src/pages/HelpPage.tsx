import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@luparx/i18n';
import {
  Card,
  CardStack,
  IconCar,
  IconChevronRight,
  IconClock,
  IconFine,
  IconPark,
  IconWallet,
} from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';

/**
 * Ayuda del ciudadano: las preguntas que llegan al mostrador.
 *
 * <h2>Cómo se eligieron</h2>
 *
 * <p>No son «preguntas frecuentes» inventadas. Son las que el producto ya contesta de alguna forma
 * —en un mensaje de error, en un texto de ayuda de un campo, en una regla de negocio— y que alguien
 * sólo puede encontrar tropezándose con ellas. Reunirlas acá no agrega comportamiento: agrega un
 * lugar donde buscarlas antes de tropezar.</p>
 *
 * <p>El texto vive en el catálogo de traducciones, como en la ayuda del fiscalizador: es contenido,
 * se corrige sin recompilar y se traduce con el resto.</p>
 *
 * <h2>Qué cambió el 07-10-2026, y por qué era un defecto y no una preferencia</h2>
 *
 * <p><b>La cabecera volvió.</b> Esta pantalla usaba `bare`, el modo de las pantallas raíz de
 * pestaña: sin barra superior, con el título como primer contenido. Pero Ayuda NO es una raíz de
 * pestaña —se entra desde «Más»— así que el modo correcto era siempre el de una pantalla de
 * detalle: flecha de volver y título en la barra. No se creó ninguna cabecera: se dejó de pedir la
 * excepción.</p>
 *
 * <p><b>Las seis tarjetas llevan a algún lado.</b> Eran seis párrafos. Explicaban bien y dejaban a
 * la persona donde estaba: quien lee «se recarga en los puntos habilitados o con tarjeta» tiene que
 * cerrar la ayuda, acordarse y navegar. Ahora la tarjeta entera es el botón, con la misma pieza que
 * el fiscalizador usa desde el 26-09 (`.lx-help-card`), frase corta y flecha.</p>
 *
 * <h2>Las dos cosas que NO se pudieron enlazar como pide el documento</h2>
 *
 * <ul>
 *   <li><b>Ampliar el estacionamiento no tiene ruta.</b> Es `ExtendSessionSheet`, un panel que se
 *       abre desde la tarjeta de la estadía en curso del Inicio. Así que la acción lleva al Inicio,
 *       que es donde está el botón de verdad cuando hay algo que ampliar. Inventarle un `/extend`
 *       habría sido una ruta nueva para una pantalla que no existe.</li>
 *   <li><b>Apelar necesita una boleta.</b> La ruta es `/fines/:id/appeal`: sin el identificador no
 *       hay apelación que abrir, así que la acción lleva a Multas, que es donde se elige cuál.</li>
 * </ul>
 */
interface Tema {
  clave: 'park' | 'extend' | 'fine' | 'appeal' | 'wallet' | 'plate';
  icono: React.ReactNode;
  /** Una ruta que YA existe. Ninguna de estas seis es nueva. */
  ruta: string;
}

const TEMAS: Tema[] = [
  { clave: 'park', icono: <IconPark />, ruta: '/park' },
  // Ver arriba: el panel de ampliar vive en la tarjeta de la estadía del Inicio, no en una ruta.
  { clave: 'extend', icono: <IconClock />, ruta: '/' },
  { clave: 'fine', icono: <IconFine />, ruta: '/fines' },
  // Y apelar necesita saber CUÁL boleta, así que se elige en la lista.
  { clave: 'appeal', icono: <IconFine />, ruta: '/fines' },
  { clave: 'wallet', icono: <IconWallet />, ruta: '/wallet' },
  { clave: 'plate', icono: <IconCar />, ruta: '/vehicles' },
];

export function HelpPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <CitizenShell title={t('citizen.help.title')} onBack={() => navigate('/more')}>
      <CardStack>
        {TEMAS.map((tema) => (
          <Card key={tema.clave}>
            {/* La misma pieza del fiscalizador, no una copia: `.lx-help-card` ya resuelve el icono,
                la jerarquía del texto y el blanco táctil de la tarjeta entera. */}
            <button type="button" className="lx-help-card" onClick={() => navigate(tema.ruta)}>
              <span className="lx-help-card__icon" aria-hidden="true">
                {tema.icono}
              </span>
              <span className="lx-help-card__text">
                <span className="lx-help-card__title">
                  {t(`citizen.help.${tema.clave}.title` as TranslationKey)}
                </span>
                <span className="lx-text-meta">
                  {t(`citizen.help.${tema.clave}.body` as TranslationKey)}
                </span>
                <span className="lx-help-card__action">
                  {t(`citizen.help.${tema.clave}.action` as TranslationKey)}
                  <span className="lx-help-card__go" aria-hidden="true">
                    <IconChevronRight size={14} />
                  </span>
                </span>
              </span>
            </button>
          </Card>
        ))}
      </CardStack>
    </CitizenShell>
  );
}
