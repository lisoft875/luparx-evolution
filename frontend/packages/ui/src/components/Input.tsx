import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /**
   * La unidad del número, pegada al campo: «minutos», «días», «₡».
   *
   * Existe porque un número sin unidad es un número que hay que adivinar. El caso que lo motivó:
   * el techo total de una estadía se editaba como un `720` pelado —ni el label ni la ayuda decían
   * «minutos»— y quien lo leía no sabía si eran minutos, horas o días (auditoría del 22-09-2026,
   * P0: «nunca mostrar 720, 90 o 5 sin unidad visible»).
   *
   * Va dentro del marco del campo y no como texto aparte, para que no se separe del número al
   * cambiar de tamaño de pantalla, y es `aria-hidden`: el label del campo ya debe nombrar la
   * unidad para quien usa lector de pantalla, y repetirla la leería dos veces.
   */
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, suffix, className, ...rest },
  ref,
) {
  const classes = ['lx-input', invalid ? 'lx-input--invalid' : '', className].filter(Boolean).join(' ');
  const input = (
    <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />
  );
  if (!suffix) return input;
  return (
    <span className="lx-input-wrap">
      {input}
      <span className="lx-input-wrap__suffix" aria-hidden="true">
        {suffix}
      </span>
    </span>
  );
});
