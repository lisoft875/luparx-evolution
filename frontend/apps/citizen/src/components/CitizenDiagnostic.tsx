import * as React from 'react';
import { useAuth } from '@luparx/auth';
import { useIsOnline } from '@luparx/features';
import { useTranslation } from '@luparx/i18n';
import { DiagnosticList, IconOffline, IconSystem, IconUser, Modal } from '@luparx/ui';
import type { DiagnosticCheck } from '@luparx/ui';

/**
 * ¿Está funcionando la aplicación? — la versión del ciudadano.
 *
 * <h2>Por qué tres comprobaciones y no las seis del fiscalizador</h2>
 *
 * <p>El fiscalizador mide además la cola de boletas, la cámara y el GPS. El ciudadano no tiene cola
 * —sus acciones van contra el servidor en el momento—, la cámara no entra en ningún flujo suyo, y
 * la zona de estacionamiento se elige de una lista, no del satélite. Copiar esas tres filas habría
 * llenado la pantalla de estados sobre cosas que esta aplicación no usa, que es justo lo que el
 * encargo del 06-10 vino a quitar de la Ayuda.</p>
 *
 * <p>Lo que se comparte es la PIEZA: `DiagnosticList`, del paquete de interfaz. Lo que se mide es
 * de cada portal.</p>
 *
 * <h2>La que falta, dicha como tal</h2>
 *
 * <p>No hay fila de notificaciones. En el navegador esta aplicación no usa notificaciones del
 * sistema —los avisos viajan por correo, y sus preferencias viven en la pantalla de Avisos— y el
 * recordatorio de estadía existe sólo en la compilación nativa, detrás de un `hook` que reconcilia
 * alarmas al montarse. Leer un permiso que en web no existe para después pintarlo de verde sería la
 * misma mentira que ya se rechazó con la cámara del fiscalizador. La opción «No recibo
 * notificaciones» del centro de ayuda lleva a Avisos, que es donde de verdad se arregla.</p>
 */
function almacenamientoDisponible(): boolean {
  try {
    const clave = 'luparx.diag.probe';
    window.localStorage.setItem(clave, '1');
    window.localStorage.removeItem(clave);
    return true;
  } catch {
    return false;
  }
}

export interface CitizenDiagnosticProps {
  open: boolean;
  onClose: () => void;
}

export function CitizenDiagnostic({ open, onClose }: CitizenDiagnosticProps): React.JSX.Element {
  const { t } = useTranslation();
  const online = useIsOnline();
  const { status, activeTenant } = useAuth();

  const guarda = almacenamientoDisponible();

  const checks: DiagnosticCheck[] = [
    {
      key: 'connection',
      tone: online ? 'ok' : 'problem',
      icon: <IconOffline />,
      title: t('citizen.help.diag.connection'),
      state: online ? t('citizen.help.diag.connection.ok') : t('citizen.help.diag.connection.off'),
      // Sin botón: en el ciudadano no hay panel de conexión que abrir, y «reintentar» no
      // reconecta nada. Lo honesto es decir qué pasa y qué hacer.
      note: online ? undefined : t('citizen.help.diag.connection.note'),
    },
    {
      key: 'session',
      tone: status === 'authenticated' && activeTenant ? 'ok' : 'problem',
      icon: <IconUser />,
      title: t('citizen.help.diag.session'),
      state:
        status === 'authenticated' && activeTenant
          ? t('citizen.help.diag.session.ok')
          : t('citizen.help.diag.session.problem'),
      note: status === 'authenticated' && activeTenant ? undefined : t('citizen.help.diag.session.note'),
    },
    {
      key: 'app',
      tone: guarda ? 'ok' : 'problem',
      icon: <IconSystem />,
      title: t('citizen.help.diag.app'),
      state: guarda ? t('citizen.help.diag.app.ok') : t('citizen.help.diag.app.problem'),
      note: guarda ? undefined : t('citizen.help.diag.app.note'),
      action: guarda
        ? undefined
        : {
            label: t('citizen.help.diag.app.reload'),
            onClick: () => window.location.reload(),
            kind: 'remedy',
          },
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('citizen.help.diag.title')}
      closeLabel={t('common.close')}
    >
      <DiagnosticList
        checks={checks}
        summaryTestId="ciudadano-diagnostico-resumen"
        summary={{
          allGood: t('citizen.help.diag.allGood'),
          warning: t('citizen.help.diag.someWarning'),
          problem: t('citizen.help.diag.someIssue'),
        }}
        toneLabels={{
          ok: t('citizen.help.diag.tone.ok'),
          warning: t('citizen.help.diag.tone.warning'),
          problem: t('citizen.help.diag.tone.problem'),
        }}
      />
    </Modal>
  );
}
