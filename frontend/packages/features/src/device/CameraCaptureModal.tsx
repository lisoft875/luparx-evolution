import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button, Modal } from '@luparx/ui';
import {
  abrirCamara,
  detenerCamara,
  fotoDelFotograma,
  type FotoTomada,
  type ProblemaDeCamara,
} from './webCamera';

export interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Se llama con la fotografía confirmada. Cerrar la ventana es responsabilidad de quien la abre.
   *
   * <p>Opcional desde el 13-10-2026: en modo {@link soloVista} no hay disparador, así que no hay
   * fotografía que entregar y exigir el callback obligaría a escribir uno vacío.</p>
   */
  onCapture?: (foto: FotoTomada) => void;
  /**
   * Mirar la cámara sin tomar nada.
   *
   * <p>Lo pide el «Prompt de permisos del dispositivo» (13-10-2026) para el fiscalizador: «con
   * permiso concedido, abrir una vista de prueba con imagen en vivo o vista previa y un botón claro
   * para cerrar». Una PRUEBA no necesita obturador — el vídeo en vivo ya demuestra que el aparato
   * entrega imagen— y no tenerlo resuelve de raíz la otra regla del mismo encargo: «las fotos
   * tomadas durante la prueba son temporales: no adjuntarlas ni guardarlas en una boleta real». No
   * se guardan porque no se toman.</p>
   *
   * <p>Es aditivo: sin esta bandera la ventana se comporta exactamente como antes, que es como la
   * usa el Ciudadano para la evidencia de una impugnación.</p>
   */
  soloVista?: boolean;
  /**
   * Cómo terminó el intento de abrir la cámara, para quien necesite PINTAR ese resultado fuera.
   *
   * <p>La ventana ya muestra el motivo dentro; esto existe porque la fila de «Permisos del
   * dispositivo» tiene que quedar en el estado correcto después de cerrarse, y adivinarlo desde
   * fuera volviendo a abrir la cámara sería pedir el permiso dos veces.</p>
   */
  onEstado?: (resultado: 'ok' | ProblemaDeCamara) => void;
  /**
   * Qué hacer cuando la cámara no está: adjuntar un archivo ya tomado.
   *
   * <p>Opcional porque no toda pantalla tiene esa alternativa, y ofrecer un botón que no lleva a
   * ningún lado es peor que no ofrecerlo. Donde existe, es la única salida real de «esta
   * computadora no tiene cámara», y por eso se ofrece EN el mismo sitio donde se dio la mala
   * noticia y no tres pantallas más atrás.</p>
   */
  onAttachFile?: () => void;
}

/**
 * Tomar una fotografía con la cámara del navegador: ver, disparar, revisar, repetir o confirmar.
 *
 * <h2>Por qué hay un paso de revisión y no se guarda al disparar</h2>
 *
 * <p>Porque una evidencia borrosa se descubre mirándola, no tomándola. El encargo del fiscalizador
 * lo pide en letra —«permite tomar una foto, previsualizarla, repetirla o confirmarla»— y para el
 * ciudadano que impugna una multa vale igual: la foto que no se lee no prueba nada, y darse cuenta
 * después de enviarla no sirve.</p>
 *
 * <h2>El stream</h2>
 *
 * <p>Se abre al abrirse la ventana y se apaga SIEMPRE al cerrarse —también cuando se cierra con
 * Escape, con el fondo, o porque el componente se desmonta—. Esa es la razón de que el stream viva
 * en una referencia además del estado: el cierre de limpieza del efecto tiene que poder apagar el
 * que esté vivo en ese instante, no el que existía cuando el efecto se montó.</p>
 */
export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  onAttachFile,
  soloVista = false,
  onEstado,
}: CameraCaptureModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [problema, setProblema] = useState<ProblemaDeCamara | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [tomada, setTomada] = useState<FotoTomada | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);

  const apagar = useCallback(() => {
    detenerCamara(streamRef.current);
    streamRef.current = null;
  }, []);

  /* En una referencia y no en las dependencias del efecto: si `onEstado` llega como una función
     nueva en cada pintada del padre —que es lo normal— ponerla en el array reabriría la cámara en
     cada render, y reabrir la cámara es pedir el permiso otra vez. */
  const avisar = useRef(onEstado);
  useEffect(() => {
    avisar.current = onEstado;
  }, [onEstado]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelado = false;
    setProblema(null);
    setTomada(null);
    setAbriendo(true);
    void (async () => {
      const resultado = await abrirCamara();
      if (cancelado) {
        if ('stream' in resultado) detenerCamara(resultado.stream);
        return;
      }
      setAbriendo(false);
      if ('problema' in resultado) {
        setProblema(resultado.problema);
        avisar.current?.(resultado.problema);
        return;
      }
      streamRef.current = resultado.stream;
      /* «Se abrió» no es lo mismo que «entrega imagen»: un stream sin pista de vídeo es un stream
         vacío, y el encargo pide comprobar que la cámara «puede abrirse Y entregar imagen». Es la
         misma condición que ya comprueba `probarCamara()` en el módulo compartido. */
      avisar.current?.(resultado.stream.getVideoTracks().length > 0 ? 'ok' : 'notFound');
      if (videoRef.current) {
        videoRef.current.srcObject = resultado.stream;
        // `play()` rechaza si la ventana se cerró mientras tanto; no es un error que mostrar.
        void videoRef.current.play().catch(() => undefined);
      }
    })();
    return () => {
      cancelado = true;
      apagar();
    };
  }, [open, apagar]);

  /* La URL de la vista previa es un objeto en memoria: si no se revoca, cada repetición deja una
     fotografía entera retenida por el navegador. */
  useEffect(() => {
    if (!tomada) {
      setVistaPrevia(null);
      return undefined;
    }
    const url = URL.createObjectURL(tomada.blob);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [tomada]);

  async function disparar(): Promise<void> {
    if (!videoRef.current) return;
    const foto = await fotoDelFotograma(videoRef.current);
    if (!foto) {
      setProblema('failed');
      return;
    }
    setTomada(foto);
  }

  function confirmar(): void {
    if (!tomada) return;
    onCapture?.(tomada);
    setTomada(null);
    onClose();
  }

  function cerrar(): void {
    setTomada(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={soloVista ? t('device.capture.testTitle') : t('device.capture.title')}
      closeLabel={soloVista ? t('device.capture.close') : t('device.capture.cancel')}
    >
      <div className="lx-camera">
        {problema ? (
          <>
            <Alert tone={problema === 'denied' ? 'warning' : 'info'}>{t(`device.camera.note.${problema}`)}</Alert>
            {onAttachFile ? (
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  onAttachFile();
                  cerrar();
                }}
              >
                {t('device.capture.attach')}
              </Button>
            ) : null}
          </>
        ) : tomada && vistaPrevia ? (
          <>
            <img className="lx-camera__shot" src={vistaPrevia} alt={t('device.capture.preview')} />
            <div className="lx-camera__actions">
              <Button type="button" variant="secondary" fullWidth onClick={() => setTomada(null)}>
                {t('device.capture.again')}
              </Button>
              <Button type="button" fullWidth onClick={confirmar}>
                {t('device.capture.use')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* `muted` y `playsInline` no son decoración: sin ellos iOS se niega a reproducir en
                línea y abre el vídeo a pantalla completa, que no es lo que esta ventana hace. */}
            <video
              ref={videoRef}
              className="lx-camera__video"
              muted
              playsInline
              autoPlay
              aria-label={t('device.capture.live')}
            />
            {abriendo ? (
              <p className="lx-text-meta" role="status" style={{ margin: 0 }}>
                {t('device.capture.opening')}
              </p>
            ) : null}
            {/* En modo prueba no hay obturador: lo que se comprueba es que el aparato entrega
                imagen, y eso ya se está viendo. Lo que sí hay es una salida evidente, porque el
                encargo pide «un botón claro para cerrar» y la X del encabezado no lo es cuando lo
                que llena la pantalla es un vídeo. */}
            {soloVista ? (
              <>
                {!abriendo ? (
                  <p className="lx-text-meta" role="status" style={{ margin: 0 }}>
                    {t('device.capture.testOk')}
                  </p>
                ) : null}
                <Button type="button" variant="secondary" fullWidth onClick={cerrar}>
                  {t('device.capture.close')}
                </Button>
              </>
            ) : (
              <Button type="button" fullWidth disabled={abriendo} onClick={() => void disparar()}>
                {t('device.capture.shutter')}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
