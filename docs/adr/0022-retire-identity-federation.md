# 0022 — Retirar la federación de identidad: LupaRX emite sus propias credenciales

- **Estado**: Aceptado
- **Fecha**: 2026-09-10
- **Supersede**: [ADR 0006](0006-identity-federation.md) — Federación de identidad (Google,
  Microsoft Entra ID, Facebook).

## Contexto

La 0006 decidió, en el arranque del producto, aceptar identidades de Google, Microsoft y Facebook
para bajar la fricción del registro. Lo que se construyó de eso fue la mitad de ida: la tabla
`user_federated_identities`, las reglas de vinculación, `GET /auth/{portal}/oauth2/{provider}/start`
y tres botones en las cuatro pantallas de entrada. El callback nunca se implementó — contestaba
`501` desde la v0.1 — así que **ningún usuario entró jamás por esta puerta**.

Al ir a cerrarlo apareció la pregunta que la 0006 no se había hecho: *¿esta plataforma quiere que la
identidad de sus usuarios dependa de un tercero?* Es una plataforma municipal. Lo que identifica a
una persona aquí es la cédula con la que se le emite una boleta, no una cuenta de correo. Y las
consecuencias de la dependencia no son teóricas:

- una cuenta cuyo único acceso es un proveedor externo **no tiene regreso** cuando ese proveedor se
  pierde o se cierra; la propia 0006 lo anotó como consecuencia y dejó el flujo de recuperación
  «fuera de alcance»;
- cada proveedor es una superficie de mantenimiento que el equipo no controla: cambian endpoints,
  rotan llaves, cambian sus reglas de verificación y sus pantallas de consentimiento;
- publicar la app obliga a un trámite con cada proveedor, por país y por marca, para cada
  municipalidad que despliegue esto;
- y ninguno de los tres resuelve el dato que sí hace falta (identificación, dirección, fecha de
  nacimiento, CONTRACT.md §2), así que la fricción que la 0006 quería ahorrar reaparecía completa en
  el formulario de registro.

## Alternativas consideradas

1. **Terminar el callback** (era el trabajo en curso: PKCE, `state` de un solo uso, verificación del
   `id_token`). Técnicamente correcto y ya escrito, pero compra las cuatro consecuencias de arriba y
   una tabla y un job de purga para sostenerlas.
2. **Dejar los botones y esconderlos por configuración.** Reversible en un commit, pero deja código
   muerto en la ruta de autenticación, que es el peor sitio posible para tenerlo: alguien lo vuelve a
   cablear sin leer esta decisión.
3. **Retirar la federación por completo (elegida).**

## Decisión

**LupaRX emite sus propias credenciales y no acepta identidades de terceros.** Correo y contraseña,
que es lo que ya existía y funcionaba: Argon2id, política de contraseñas, limitador de intentos en
base de datos, verificación del correo, restablecimiento por correo (ADR 0005).

Se retira en la v0.39: `FederationController` y sus tres rutas, `FederatedIdentityService`,
`FederatedProvider`, `ExternalIdentity`, `UserFederatedIdentity` y su repositorio, la configuración
`luparx.federation.*`, los códigos de error `FEDERATION_*`, el `oauth-state-ttl`, los botones, sus
iconos de marca y sus claves de traducción.

**El esquema se retira después, no ahora** (expand-and-contract, ADR 0010). `user_federated_identities`
y el valor `FEDERATED_LINK_CONFIRMATION` de `verification_tokens.purpose` se quedan una versión: una
instancia anterior corriendo en paralelo durante un despliegue no puede tropezarse con una tabla que
desapareció. La migración de contracción va en la versión siguiente, y hasta entonces las dos
constantes que nombran esas filas se conservan en el código **con un comentario que dice por qué**
(`VerificationPurpose.FEDERATED_LINK_CONFIRMATION`, `AuditAction.FEDERATED_IDENTITY_LINKED`).

`AuditAction.FEDERATED_IDENTITY_LINKED` es un caso aparte y se conserva sin fecha de retiro: la
bitácora es un vocabulario, no un camino de código. `audit_events` tiene triggers que prohíben
`UPDATE` y `DELETE` desde la v0.32 — precisamente para que nadie pueda reescribir el pasado— así que
una fila escrita con esa acción tiene que seguir siendo legible y filtrable para siempre.

## Consecuencias / trade-offs

- (+) Una sola forma de entrar, que la plataforma controla de punta a punta y puede auditar sin
  depender de la disponibilidad ni de las reglas de nadie.
- (+) Desaparece la clase entera de problemas de la 0006: cuentas sin ruta de recuperación,
  vinculación por correo coincidente, secuestro vía proveedor comprometido.
- (+) Menos superficie: tres rutas públicas menos en la cadena de autenticación, seis códigos de
  error menos, un secreto de configuración menos por proveedor y por entorno.
- (−) Más fricción para registrarse que un botón. Es una plataforma donde el registro pide cédula y
  dirección de todos modos; el botón nunca iba a evitar ese formulario.
- (−) Si mañana una municipalidad exige entrar con la cuenta institucional de su personal, esto se
  revisa. No sería revivir la 0006: sería federación **por municipalidad y sólo para portales de
  funcionario**, que es una decisión distinta y merece su propia ADR.

## Impacto de migración

Ninguno para los datos: `user_federated_identities` está vacía en todos los entornos, porque el
callback nunca funcionó. Ningún usuario tiene que hacer nada. `RegisterRequest` no cambia — el campo
`federationTicket` que se había agregado ese mismo día no llegó a existir en ninguna versión
publicada.

Para un cliente antiguo, las tres rutas `/oauth2/**` pasan a contestar `404`. Es aceptable
justamente porque la única de las tres que funcionaba redirigía a un `501`: no había forma de que un
cliente dependiera de ellas.

## Estrategia de rollback

`git revert` del commit de la v0.39 devuelve el código, y el esquema sigue en su sitio, así que no
hay nada que restaurar en la base. Lo que **no** vuelve por revert es esta decisión: si alguien lo
hace, que sea con una ADR nueva que la supersede y diga qué cambió.
