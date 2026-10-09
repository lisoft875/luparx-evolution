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
  /** Se llama con la fotografía confirmada. Cerrar la ventana es responsabilidad de quien la abre. */
  onCapture: (foto: FotoTomada) => void;
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
        return;
      }
      streamRef.current = resultado.stream;
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
    onCapture(tomada);
    setTomada(null);
    onClose();
  }

  function cerrar(): void {
    setTomada(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={cerrar} title={t('device.capture.title')} closeLabel={t('device.capture.cancel')}>
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
            <Button type="button" fullWidth disabled={abriendo} onClick={() => void disparar()}>
              {t('device.capture.shutter')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
