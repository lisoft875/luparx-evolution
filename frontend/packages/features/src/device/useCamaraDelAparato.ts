import { useCallback, useEffect, useState } from 'react';
import {
  estadoDeCamara,
  probarCamara,
  soporteDeCamara,
  type EstadoDeCamara,
  type ProblemaDeCamara,
} from './webCamera';

export interface CamaraDelAparato {
  /** Lo que el navegador dice del permiso, sin haber preguntado nada. */
  estado: EstadoDeCamara;
  /** Si en este aparato tiene sentido ofrecerla, y si no, por qué. */
  soporte: 'ok' | ProblemaDeCamara;
  /**
   * El resultado de la ÚLTIMA comprobación real, o `null` si todavía no se hizo ninguna.
   *
   * <p>Esto es lo que distingue «el navegador dice que sí» de «lo probamos y respondió», que es la
   * distinción que el encargo exige. Mientras valga `null` ninguna pantalla puede decir que la
   * cámara funciona: puede decir, como mucho, que el permiso no está bloqueado.</p>
   */
  prueba: 'ok' | ProblemaDeCamara | null;
  probando: boolean;
  /** Vuelve a leer el permiso sin abrir ningún aviso. */
  medir: () => Promise<void>;
  /** Abre la cámara de verdad y la cierra. Dispara el aviso del sistema: va en un botón. */
  probar: () => Promise<'ok' | ProblemaDeCamara>;
}

/**
 * El estado de la cámara de este aparato, para una pantalla que lo muestre.
 *
 * <p>Mide al montarse —leer el permiso no abre ningún aviso— y vuelve a medir después de cada
 * comprobación, porque conceder el permiso cambia lo que `permissions.query` contesta y una
 * pantalla que no se entera deja a la persona mirando el problema que acaba de resolver.</p>
 */
export function useCamaraDelAparato(activo = true): CamaraDelAparato {
  const [estado, setEstado] = useState<EstadoDeCamara>('asksOnUse');
  const [soporte, setSoporte] = useState<'ok' | ProblemaDeCamara>('ok');
  const [prueba, setPrueba] = useState<'ok' | ProblemaDeCamara | null>(null);
  const [probando, setProbando] = useState(false);

  const medir = useCallback(async () => {
    setSoporte(soporteDeCamara());
    setEstado(await estadoDeCamara());
  }, []);

  useEffect(() => {
    if (!activo) return;
    void medir();
  }, [activo, medir]);

  const probar = useCallback(async () => {
    setProbando(true);
    try {
      const resultado = await probarCamara();
      setPrueba(resultado);
      await medir();
      return resultado;
    } finally {
      setProbando(false);
    }
  }, [medir]);

  return { estado, soporte, prueba, probando, medir, probar };
}
