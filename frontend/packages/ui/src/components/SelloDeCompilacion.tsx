import * as React from 'react';
import { selloLegible } from '../selloDeCompilacion';

/**
 * El sello de compilación al pie de la vista (23-10-2026).
 *
 * <p>Una línea discreta que dice qué compilación se está mirando: un consecutivo de fecha y hora
 * y el commit del que salió. Existe para contestar dos preguntas que hoy sólo se pueden contestar
 * entrando al servidor: <b>¿salió el despliegue?</b> y <b>¿qué código quedó?</b></p>
 *
 * <h2>En producción no existe</h2>
 *
 * <p>No «se oculta»: no se dibuja. La decisión la toma {@link selloLegible} contra una lista de
 * entornos permitidos, así que una variable mal escrita o sin declarar deja el sello fuera en vez
 * de dentro. No hay nada que acordarse de borrar antes de publicar, que es justamente lo que se
 * olvida.</p>
 *
 * <h2>Por qué no es un elemento fijo</h2>
 *
 * <p>Va al final del contenido y se desplaza con él. Pegado abajo tendría que pelear con la barra
 * de navegación del Ciudadano y del Inspector, con la barra fija de «Continuar» y con el teclado,
 * y acabaría tapando algo; un sello de desarrollo que estorba la pantalla que viene a verificar no
 * sirve de nada.</p>
 *
 * <p>`aria-hidden` y `user-select: all`: para quien usa lector de pantalla es ruido en todas las
 * pantallas, y para quien tiene que copiarlo en un mensaje, un clic lo selecciona entero.</p>
 */
export interface SelloDeCompilacionProps {
  /** `LUPARX_ENVIRONMENT` del despliegue. Sin él, no hay sello. */
  entorno: string | null;
  /** El instante del build, en ISO. */
  construidoEn: string | null;
  /** El hash corto del commit, si la compilación lo supo. */
  commit: string | null;
  /** El idioma con el que escribir la fecha completa del `title`. */
  idioma?: string;
}

export function SelloDeCompilacion({
  entorno,
  construidoEn,
  commit,
  idioma,
}: SelloDeCompilacionProps): React.JSX.Element | null {
  const sello = selloLegible(entorno, construidoEn, commit, idioma);
  if (!sello) return null;
  return (
    <p
      className="lx-sello"
      aria-hidden="true"
      data-lx-sello={sello.consecutivo}
      data-lx-entorno={sello.entorno}
      title={`${sello.completa}${sello.commit ? ` · ${sello.commit}` : ''} · ${sello.entorno}`}
    >
      <span className="lx-sello__entorno">{sello.entorno}</span>
      <span className="lx-sello__numero">{sello.consecutivo}</span>
      {sello.commit ? <span className="lx-sello__commit">{sello.commit}</span> : null}
    </p>
  );
}
