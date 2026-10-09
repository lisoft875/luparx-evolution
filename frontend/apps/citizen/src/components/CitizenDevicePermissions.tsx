import * as React from 'react';
import { useCamaraDelAparato } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { DiagnosticList, IconEye, Modal } from '@luparx/ui';
import type { DiagnosticCheck } from '@luparx/ui';

export interface CitizenDevicePermissionsProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Permisos del dispositivo — la versión del ciudadano.
 *
 * <h2>Una sola fila, y es deliberado</h2>
 *
 * <p>El fiscalizador muestra cámara y ubicación porque las dos entran en su trabajo: una boleta
 * sin coordenadas vale menos. El ciudadano usa la cámara —para la evidencia de una impugnación— y
 * NO usa la ubicación: la zona donde estaciona la elige de una lista. Su encargo lo prohíbe en
 * letra: «no solicitar ubicación ni otros permisos como consecuencia de habilitar la cámara».
 * Añadir esa fila sería pedirle al ciudadano un permiso que esta aplicación no gasta.</p>
 *
 * <p>Lo compartido es el aparato, no la política: `useCamaraDelAparato` y la ventana de captura
 * viven en el paquete común y los dos portales los usan; qué permisos pide cada uno, cuándo y con
 * qué explicación, se decide acá.</p>
 *
 * <h2>«Comprobar» abre la cámara de verdad</h2>
 *
 * <p>El encargo lo pide con todas las letras —«verificar el acceso real a la cámara; no basta con
 * cambiar el texto ni mostrar un estado verde»— y es exactamente el defecto que se reportó: el
 * panel decía «Se pide al usarla» y, en la misma ventana, «Todo está funcionando correctamente».
 * Acá el botón ABRE la cámara, confirma que llegó una pista de vídeo y la apaga en el acto. Hasta
 * que eso pase, el estado no es verde: el navegador puede decir que el permiso está concedido
 * mientras la única cámara del aparato la tiene tomada otra aplicación.</p>
 */
export function CitizenDevicePermissions({ open, onClose }: CitizenDevicePermissionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const camara = useCamaraDelAparato(open);

  /*
    El estado en palabras, con una regla de precedencia que importa:

      1. Si el aparato no puede (sin soporte, sin HTTPS), eso manda sobre cualquier permiso: un
         permiso concedido en un navegador que no entrega la cámara no sirve de nada.
      2. Si ya se probó, manda la prueba. Es el único dato que vio una imagen.
      3. Si no, manda el permiso leído, y «concedido sin probar» NO es verde: es «sin comprobar»,
         que es la verdad.
  */
  const fila = ((): DiagnosticCheck => {
    if (camara.soporte !== 'ok') {
      return {
        key: 'camera',
        tone: 'warning',
        icon: <IconEye />,
        title: t('device.camera.title'),
        state: t(`device.camera.state.${camara.soporte}`),
        note: t(`device.camera.note.${camara.soporte}`),
      };
    }
    if (camara.prueba === 'ok') {
      return {
        key: 'camera',
        tone: 'ok',
        icon: <IconEye />,
        title: t('device.camera.title'),
        state: t('device.camera.state.granted'),
        note: t('device.camera.note.granted'),
      };
    }
    if (camara.prueba !== null) {
      // La prueba falló, y el motivo exacto es lo que se muestra: «bloqueada» y «la tiene tomada
      // otra aplicación» se arreglan en sitios distintos.
      const fallo = camara.prueba;
      return {
        key: 'camera',
        tone: 'warning',
        icon: <IconEye />,
        title: t('device.camera.title'),
        state: t(`device.camera.state.${fallo}`),
        note: t(`device.camera.note.${fallo}`),
        action: {
          label: t('device.camera.test'),
          onClick: () => void camara.probar(),
          busy: camara.probando,
          busyLabel: t('device.camera.testing'),
          kind: 'permission',
        },
      };
    }
    const bloqueada = camara.estado === 'denied';
    return {
      key: 'camera',
      tone: 'warning',
      icon: <IconEye />,
      title: t('device.camera.title'),
      state: bloqueada ? t('device.camera.state.denied') : t('device.camera.state.untested'),
      note: bloqueada ? t('device.camera.note.denied') : t('device.camera.note.asksOnUse'),
      action: {
        // «Habilitar» cuando todavía no se concedió; «Comprobar» cuando el navegador ya dice que
        // sí y lo que falta es verificarlo. Dos palabras distintas porque son dos cosas distintas.
        label: camara.estado === 'granted' ? t('device.camera.test') : t('device.camera.enable'),
        onClick: () => void camara.probar(),
        busy: camara.probando,
        busyLabel: t('device.camera.testing'),
        kind: 'permission',
      },
    };
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('citizen.help.permissions.title')}
      closeLabel={t('common.close')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-3)' }}>
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.help.permissions.lead')}
        </p>
        <DiagnosticList
          summary={{
            allGood: t('citizen.help.permissions.ready'),
            warning: t('citizen.help.permissions.pending'),
            problem: t('citizen.help.permissions.pending'),
          }}
          toneLabels={{
            ok: t('citizen.help.diag.tone.ok'),
            warning: t('citizen.help.diag.tone.warning'),
            problem: t('citizen.help.diag.tone.problem'),
          }}
          checks={[fila]}
        />
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.help.permissions.none')}
        </p>
      </div>
    </Modal>
  );
}
