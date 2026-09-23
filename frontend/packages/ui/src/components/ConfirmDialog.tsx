import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Button } from './Button';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { SummaryList, SummaryRow } from './SummaryList';
import { Textarea } from './Textarea';

/** Un valor que cambia: lo que decía antes y lo que va a decir. */
export interface ConfirmChange {
  label: string;
  /** Lo que hay hoy. Se muestra tachado cuando hay un valor nuevo distinto. */
  before?: React.ReactNode;
  after: React.ReactNode;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Qué va a pasar, en una frase. Es lo que lee quien no va a leer la tabla. */
  message: React.ReactNode;
  /** El antes/después, cuando el cambio tiene valores concretos que mostrar. */
  changes?: readonly ConfirmChange[];
  /**
   * Pide un motivo antes de dejar confirmar.
   *
   * Para lo que queda registrado en la auditoría y alguien va a tener que explicar después:
   * desactivar una zona, anular una boleta. El motivo viaja al servidor, no se queda en pantalla.
   */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonError?: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** `danger` para lo que destruye o interrumpe; `primary` para un guardado corriente. */
  tone?: 'primary' | 'danger';
  loading?: boolean;
  /** Recibe el motivo cuando `requireReason`; cadena vacía cuando no. */
  onConfirm: (reason: string) => void;
}

/**
 * «Esto es lo que va a cambiar. ¿Seguimos?»
 *
 * Existe porque el portal de administración guardaba cambios de efecto operativo —tarifas, horario
 * de cobro, política de parqueo, desactivar una zona— con un solo clic y sin decir qué cambiaba
 * (auditoría del 22-09-2026, varios P0). En una plataforma municipal eso no es una comodidad: la
 * tarifa que alguien toca por error se le cobra a un ciudadano, y la zona desactivada deja de
 * recaudar sin que nadie lo note hasta el cierre del mes.
 *
 * El diálogo existía ya cuatro veces escrito a mano —`StaffPage`, `EnforcementCitationDetailPage`,
 * `FinishSessionConfirm` y `VehiclesPage`— cada una con su propia idea de qué confirmar y cómo
 * pedir el motivo. Esto las unifica: mismo orden de botones, misma validación del motivo, misma
 * forma de mostrar el antes/después.
 *
 * El botón de confirmar NO recibe el foco al abrir: `Modal` lo pone en el primer control, que acá
 * es Cancelar. Una confirmación cuyo botón peligroso está bajo la tecla Enter no confirma nada.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  changes,
  requireReason = false,
  reasonLabel,
  reasonError,
  confirmLabel,
  cancelLabel,
  closeLabel,
  tone = 'primary',
  loading = false,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  const [reason, setReason] = useState('');
  const messageId = useId();

  // El motivo se limpia al cerrar: si no, el de la vez pasada aparece escrito en la siguiente, y
  // quien no mire lo manda tal cual.
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const faltaMotivo = requireReason && reason.trim().length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      describedBy={messageId}
    >
      <div className="lx-confirm">
        <p id={messageId} className="lx-confirm__message">
          {message}
        </p>

        {changes && changes.length > 0 ? (
          <SummaryList>
            {changes.map((change) => (
              <SummaryRow
                key={change.label}
                label={change.label}
                value={
                  change.before !== undefined && change.before !== change.after ? (
                    <span>
                      {/*
                        El valor viejo tachado y el nuevo al lado: leer «₡600 → ₡800» cuesta menos
                        que recordar qué decía la pantalla de atrás. Tachado Y con flecha, para que
                        no dependa sólo del estilo.
                      */}
                      <span className="lx-confirm__before">{change.before}</span>
                      {' → '}
                      <strong>{change.after}</strong>
                    </span>
                  ) : (
                    <strong>{change.after}</strong>
                  )
                }
              />
            ))}
          </SummaryList>
        ) : null}

        {requireReason ? (
          <FormField label={reasonLabel ?? ''} error={reasonError}>
            {({ inputId, describedBy }) => (
              <Textarea
                id={inputId}
                aria-describedby={describedBy}
                invalid={Boolean(reasonError)}
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FormField>
        ) : null}

        <div className="lx-confirm__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={faltaMotivo}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
