import * as React from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

/**
 * El tono de una comprobación.
 *
 * <p>`warning` no es un `problem` flojo. `problem` es algo que ahora mismo impide trabajar o puede
 * perder datos; `warning` es algo que conviene saber y con lo que se sigue usando la aplicación
 * igual —un permiso denegado que no hace falta para la tarea principal, por ejemplo—. Pintar el
 * segundo de rojo enseña a no creerle al rojo.</p>
 */
export type DiagnosticTone = 'ok' | 'warning' | 'problem';

export interface DiagnosticAction {
  label: string;
  onClick: () => void;
  /** Mientras la acción trabaja: el botón se deshabilita y dice `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  /**
   * `remedy` arregla un problema detectado; `permission` concede algo que todavía no se ha dado.
   *
   * <p>La distinción no es cosmética: un `remedy` sólo debe aparecer ante un problema —ésa es la
   * regla que convirtió el diagnóstico en diagnóstico y no en otro menú— mientras que un
   * `permission` es una oportunidad y puede aparecer con la pantalla sana. Se dibuja como
   * `data-accion`, y las pruebas cuentan las dos clases por separado.</p>
   */
  kind: 'remedy' | 'permission';
}

export interface DiagnosticCheck {
  /** Identificador estable. Se dibuja como `data-check` y es por donde lo miden las pruebas. */
  key: string;
  tone: DiagnosticTone;
  icon: React.ReactNode;
  title: string;
  /** El estado, en palabras. Nunca sólo el color. */
  state: string;
  /** Qué significa y qué se puede hacer. Normalmente sólo cuando el tono no es `ok`. */
  note?: string;
  action?: DiagnosticAction;
}

export interface DiagnosticListProps {
  checks: DiagnosticCheck[];
  /** Las tres frases del encabezado, según el peor tono que se haya encontrado. */
  summary: { allGood: string; warning: string; problem: string };
  /** El tono dicho en palabras, para quien no distingue el color. */
  toneLabels: { ok: string; warning: string; problem: string };
  /** Lo que se muestra mientras las comprobaciones asíncronas viajan. */
  loadingLabel?: string;
  /** `true` mientras se mide: se dibuja `loadingLabel` en vez de la lista. */
  loading?: boolean;
  summaryTestId?: string;
}

/**
 * El diagnóstico de una aplicación: estado → problema → solución.
 *
 * <h2>Por qué vive en el paquete compartido</h2>
 *
 * <p>Nació dentro de la Ayuda del fiscalizador el 06-10-2026. El 07-10 el Ciudadano pidió el suyo,
 * y ahí había que elegir: copiar las ochenta líneas de pintura, o separar lo que las dos pantallas
 * comparten —la forma de una comprobación y cómo se dibuja— de lo que cada una mide, que no se
 * parece en nada. El fiscalizador comprueba la cola de boletas, la cámara y el GPS; el ciudadano no
 * tiene ninguna de las tres.</p>
 *
 * <p>Así que esto es la PRESENTACIÓN y nada más: no sabe qué es una conexión ni qué es una cola, no
 * llama a ningún servicio y no trae comprobaciones por omisión. Cada portal le pasa las suyas. Si
 * algún día las dos midieran lo mismo, sería señal de que una de las dos está midiendo de más.</p>
 *
 * <h2>Las dos reglas que el componente hace cumplir</h2>
 *
 * <ul>
 *   <li><b>El tono se dice también en palabras.</b> El color no es información para quien no lo
 *       distingue, y una fila con problema tiene que leerse como tal en un lector de pantalla.</li>
 *   <li><b>Cargando no es lo mismo que «todo bien».</b> Con `loading` se dibuja el aviso de que se
 *       está midiendo, nunca un resumen en verde sobre comprobaciones que todavía no volvieron.</li>
 * </ul>
 */
export function DiagnosticList({
  checks,
  summary,
  toneLabels,
  loadingLabel,
  loading = false,
  summaryTestId,
}: DiagnosticListProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="lx-diag">
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {loadingLabel}
        </p>
      </div>
    );
  }

  const hayProblema = checks.some((check) => check.tone === 'problem');
  const hayAviso = checks.some((check) => check.tone === 'warning');

  return (
    <div className="lx-diag">
      {/* El resumen va arriba para que la respuesta a «¿está funcionando?» se lea sin desplazarse,
          que es como se mira esto: con prisa. */}
      <Alert
        tone={hayProblema ? 'warning' : hayAviso ? 'info' : 'success'}
        testId={summaryTestId}
      >
        {hayProblema ? summary.problem : hayAviso ? summary.warning : summary.allGood}
      </Alert>
      <ul className="lx-diag__list">
        {checks.map((check) => (
          <li
            key={check.key}
            className="lx-diag__row"
            data-tono={check.tone === 'problem' ? 'problema' : check.tone === 'warning' ? 'aviso' : 'ok'}
            data-check={check.key}
            data-accion={check.action ? (check.action.kind === 'remedy' ? 'remedio' : 'permiso') : undefined}
          >
            <span className="lx-diag__icon" aria-hidden="true">
              {check.icon}
            </span>
            <div className="lx-diag__body">
              <p className="lx-diag__title">
                {check.title}
                <span className="lx-visually-hidden">
                  {' · '}
                  {check.tone === 'ok'
                    ? toneLabels.ok
                    : check.tone === 'warning'
                      ? toneLabels.warning
                      : toneLabels.problem}
                </span>
              </p>
              <p className="lx-diag__state">{check.state}</p>
              {check.note ? <p className="lx-diag__note">{check.note}</p> : null}
              {check.action ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="lx-diag__action"
                  loading={check.action.busy}
                  onClick={check.action.onClick}
                >
                  {check.action.busy && check.action.busyLabel
                    ? check.action.busyLabel
                    : check.action.label}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
