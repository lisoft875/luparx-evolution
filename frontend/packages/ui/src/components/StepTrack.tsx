import * as React from 'react';

export interface StepTrackStep {
  /** El nombre del paso: «Vehículo», «Infracción». Ya traducido. */
  label: string;
  /** Hecho de verdad: el paso tiene lo que necesita. No «ya pasé por ahí». */
  done?: boolean;
}

export interface StepTrackProps {
  steps: StepTrackStep[];
  /** En cuál está la persona, base 0. */
  current: number;
  /** El nombre accesible del indicador. */
  title: string;
  /**
   * La versión compacta, para el teléfono: «Paso 2 de 4». Se pasa ya armada porque el formato de
   * esa frase es del idioma, y este paquete nunca escribe texto visible.
   */
  compactLabel: string;
  className?: string;
}

/**
 * El avance de un formulario largo, dibujado: ① Vehículo — ② Infracción — ③ Evidencia — ④ Revisar.
 *
 * <h2>Por qué existe, y por qué no es `StepList`</h2>
 *
 * <p>`StepList` —el del flujo de estacionar del ciudadano— es una lista VERTICAL que contiene el
 * contenido de cada paso dentro de cada paso. Esto es lo otro: una barra de avance horizontal que
 * no contiene nada, sólo dice dónde va uno. Las dos formas son necesarias y ninguna reemplaza a la
 * otra; se auditó antes de crear.</p>
 *
 * <h2>Las dos presentaciones son una sola verdad</h2>
 *
 * <p>La especificación de Fiscalización pide el riel horizontal en tablet y «un stepper compacto o
 * encabezado Paso X de 4» en celular. Las dos se dibujan desde el MISMO marcado y CSS decide cuál
 * se ve, en vez de ramificar en JavaScript por ancho de pantalla: así el nombre accesible es uno,
 * no hay dos árboles que puedan desincronizarse, y no hace falta medir la ventana para pintar.</p>
 *
 * <p>Esto NO parte el formulario en pantallas. El formulario de la boleta es un solo desplazamiento
 * con sus tarjetas, y así se queda: convertirlo en un asistente de cuatro pantallas cambiaría la
 * validación, el borrador y el camino de la cola sin conexión — justo lo que el documento pide no
 * tocar. Lo que faltaba era decir en qué punto va uno, y eso es esto.</p>
 */
export function StepTrack({
  steps,
  current,
  title,
  compactLabel,
  className,
}: StepTrackProps): React.JSX.Element {
  return (
    <nav className={['lx-step-track', className].filter(Boolean).join(' ')} aria-label={title}>
      {/* El renglón del teléfono: «Paso 2 de 4 · Infracción». Oculto en tablet por CSS. */}
      <p className="lx-step-track__compact">
        <span className="lx-step-track__compact-count">{compactLabel}</span>
        <span className="lx-step-track__compact-name">{steps[current]?.label ?? ''}</span>
      </p>
      <ol className="lx-step-track__rail">
        {steps.map((step, indice) => (
          <li
            key={step.label}
            className="lx-step-track__step"
            data-estado={step.done ? 'hecho' : indice === current ? 'actual' : 'pendiente'}
            aria-current={indice === current ? 'step' : undefined}
          >
            <span className="lx-step-track__mark" aria-hidden="true">
              {indice + 1}
            </span>
            <span className="lx-step-track__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
