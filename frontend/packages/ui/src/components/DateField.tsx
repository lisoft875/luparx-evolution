import * as React from 'react';
import { Input, type InputProps } from './Input';

/** `min`/`max` are inherited from the native input (string | number); pass ISO-8601 YYYY-MM-DD strings to match the wire format (CONTRACT.md §2 `birthDate`). */
export type DateFieldProps = Omit<InputProps, 'type'>;

/** Thin `<input type="date">` wrapper — value/onChange stay ISO-8601 strings end to end, no Date object round-tripping. */
export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(function DateField(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});
