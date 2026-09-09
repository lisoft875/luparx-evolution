# 0016 — Retirar el segundo factor (MFA/TOTP) del producto

- **Estado**: Aceptado
- **Fecha**: 2026-09-09
- **Reemplaza a**: [0007 — MFA TOTP (RFC 6238) con códigos de recuperación](0007-mfa-totp.md)

## Contexto

ADR 0007 decidió TOTP obligatorio para `admin` e `inspector`. El código se construyó completo
—enrolamiento, verificación, códigos de recuperación de un solo uso, cifrado del secreto en reposo,
un filtro de servlet que exigía el factor por portal— y **nunca se encendió en ningún ambiente**:
`luparx.security.mfa-enforced-portals` estuvo vacío desde v0.3 §1 y ningún usuario llegó a
inscribirse.

Lo que quedó fue peor que no tenerlo. Las respuestas del servidor seguían llevando `mfaRequired` y
`mfaEnabled`, el login podía devolver un desafío que **ninguna pantalla sabía contestar**, y en las
compilaciones de demostración eso se manifestó exactamente así: la aplicación pedía verificación en
dos pasos y no la ofrecía. Un camino de autenticación que existe en el servidor y no en el cliente no
es una funcionalidad a medias: es una forma de dejar a alguien fuera de su propia cuenta.

Mantenerlo dormido también tenía costo permanente: una clave de cifrado por ambiente que había que
rotar y custodiar sin proteger nada, dos tablas, una columna por usuario, un filtro en las cuatro
cadenas de seguridad, y un `claim` en cada token.

## Alternativas consideradas

1. **Terminar la interfaz y encenderlo.** Es la opción correcta si el segundo factor es un requisito
   del producto. Hoy no lo es: nadie lo pidió, no hay obligación regulatoria identificada para el
   caso costarricense, y construir enrolamiento con código QR, verificación y recuperación en cuatro
   portales es trabajo que compite con lo que las municipalidades sí están esperando.
2. **Dejarlo dormido tal como estaba.** Es lo que veníamos haciendo, y es lo que produjo el defecto:
   un contrato que promete un desafío que el cliente no resuelve. Además obliga a razonar sobre MFA
   en cada cambio de autenticación, para una funcionalidad apagada.
3. **Retirarlo por completo (elegida).** El contrato deja de mencionarlo, el login vuelve a tener una
   sola salida, y la superficie de seguridad se reduce a lo que de verdad está en uso.

## Decisión

Se retira MFA del producto: código, esquema, configuración, contrato y textos.

Se van: `MfaService`, `MfaPolicy`, `MfaSetup`, `TotpService`, `TotpStatus`, `SecretCipher`,
`UserMfaTotp`, `UserMfaRecoveryCode` y sus repositorios, `MfaEnforcementFilter`, el token de desafío
y el `claim` `mfa`, los endpoints `/auth/{portal}/mfa/verify`, `/{portal}/me/mfa/*` y
`/{admin,platform}/users/{id}/mfa/require`, las tablas `user_mfa_totp` y `user_mfa_recovery_codes`,
la columna `users.mfa_required`, y las propiedades `luparx.jwt.mfa-challenge-ttl` y
`luparx.security.mfa-*`.

`PasswordAuthentication` desaparece con ellos: sin segundo factor el registro degeneraba en un solo
`User`, y un envoltorio de un campo es ruido.

`Portal.mfaMandatory()` también se va. Lo que distingue a los portales sigue siendo su audiencia y si
permiten auto-registro (ADR 0004, CONTRACT.md v0.13) — no un factor que ninguno exigía.

## Consecuencias

- (+) Un login tiene **una** salida: o hay sesión o hay error. Desaparece la rama que el cliente no
  sabía contestar.
- (+) Se elimina una clave de cifrado por ambiente que no protegía nada y sí había que custodiar.
- (+) `LoginResponse` deja de tener tres campos opcionales que sólo tenían sentido combinados.
- (−) **La cuenta de plataforma —que administra todas las municipalidades— queda protegida sólo por
  correo y contraseña.** Esto es un riesgo real y el producto lo acepta por escrito, ya no como una
  lista de configuración vacía sino como una decisión. Lo que lo compensa hoy: Argon2id, la política
  de contraseñas, el limitador de intentos respaldado en base de datos, y —requisito antes de
  exponer el portal de plataforma a internet abierto— restricción por IP.
- (−) Volver a tener segundo factor es reconstruirlo, no reactivarlo. Se juzga aceptable: si vuelve,
  debería volver como **passkeys/WebAuthn**, que es lo que un producto nuevo elegiría en 2026, y no
  como el TOTP que 0007 eligió por compatibilidad con el parque de dispositivos de 2026 temprano.

## Impacto de migración

`V23_0__drop_mfa.sql` borra las dos tablas y la columna. Es fase de contracción (ADR 0010) y va
**después** del despliegue del código que dejó de leerlas: una instancia vieja que todavía inserte
`users.mfa_required` falla en cuanto la columna no está.

Se puede hacer de un solo paso, y no en dos como exige la regla general, porque no hay una sola fila
en esas tablas ni un usuario cuyo acceso dependa de ellas. Si hubiera inscripciones activas el orden
sería el contrario: primero dejar de exigir el factor, después esperar a que nadie dependa de él, y
sólo entonces borrar.

## Reversión

Revertir el commit devuelve el código. **No devuelve los datos**, porque no hay ninguno que devolver.
La reversión real —volver a tener un segundo factor— es la reconstrucción descrita arriba.
