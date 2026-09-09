# LupaRX — Seguridad

> Complementa `docs/CONTRACT.md` y `docs/adr/`. Alineado con OWASP ASVS 5, OWASP Top 10 y NIST SSDF.
> No sustituye una revisión de seguridad formal previa a producción (checklist al final).

## 1. Modelo de amenazas (resumen)

| Activo | Amenaza principal | Impacto | Mitigación |
|---|---|---|---|
| Credenciales de usuario | Fuerza bruta / credential stuffing | Toma de cuenta | Argon2id, `auth_attempts` + bloqueo por intentos. **Sin segundo factor** (ADR 0016): riesgo aceptado, mitigado además con restricción por IP en el portal de plataforma |
| Access/refresh tokens | Robo vía XSS, dispositivo comprometido, red insegura | Suplantación de sesión | Storage aislado por app, refresh opaco con rotación y detección de reuso, `aud` por portal |
| Datos de otro tenant | IDOR/BOLA, fuga por caché/log/export | Violación de confidencialidad municipal, incumplimiento legal | Defensa en profundidad multi-tenant (ver `docs/ARCHITECTURE.md` §4), RLS como capa adicional (ADR 0002) |
| Documento de identidad / fecha de nacimiento | Exfiltración de datos personales sensibles | Daño a la persona, incumplimiento de protección de datos | Minimización, cifrado en reposo donde aplique, control de acceso estricto, auditoría de lectura |
| Webhooks de pago (v0.3+) | Replay, falsificación de origen | Fraude financiero | Verificación de firma del proveedor, `event_id` persistido antes de procesar (ADR 0012) |
| Endpoints públicos de catálogo | Scraping / abuso | Costo de infraestructura, exposición de datos de municipalidades no publicadas | Rate limiting básico, sólo tenants con `status` publicable expuestos |

## 2. Autenticación

- Argon2id para contraseñas; nunca almacenar en claro ni con hash reversible (ADR 0005).
- JWT RS256 con JWKS público; el resource server valida firma, `exp`, `aud` (por portal) y `tid`
  contra la ruta invocada. Rechazo explícito de `alg=none` y de algoritmos no RS256.
- **No hay segundo factor** (ADR 0016). Es una decisión del producto, no una configuración
  pendiente: lo que protege una cuenta es la contraseña, su política, y el limitador de intentos.
  Antes de exponer el portal de plataforma a internet abierto hay que restringirlo por IP.
- Rate limiting y bloqueo por intentos vía `auth_attempts` (por `email_hash` + `portal` + `ip_hash`),
  consultado en base de datos — válido con cualquier número de instancias backend.
- `credentials_version` permite invalidar de inmediato todos los tokens emitidos antes de un
  cambio de contraseña o un reseteo forzado por admin, sin esperar la expiración natural.

## 3. Autorización a nivel de recurso (IDOR/BOLA)

- Ningún endpoint autoriza sólo por rol; todo acceso a un recurso de tenant valida además la
  membresía real (`tenant_memberships(user_id, tenantId, status=ACTIVE)`) contra el recurso
  solicitado, no contra lo que el cliente afirme en el request.
- `PLATFORM_ADMIN` es la única excepción a la validación de membresía por tenant, y su uso queda
  auditado explícitamente (fila en `audit_events` marcando alcance de plataforma).
- `TENANT_ADMIN` nunca implica acceso a otros tenants: el rol es siempre relativo a la membresía
  que lo otorga, nunca global por el solo nombre del rol.
- Los permisos (`Permission` enum + `RolePermissions`) son configuración, no condicionales
  `if (role == "ADMIN")` dispersos en el código — un cambio de qué puede hacer un rol es un cambio
  de datos, no de despliegue.

## 4. Aislamiento entre tenants

Ver `docs/ARCHITECTURE.md` §4 (repositorio, servicio, API, jobs, caché, exportes, logs) y ADR 0002
(esquema compartido + `tenant_id` + RLS como capa adicional). Pruebas de integración obligatorias
por módulo con `tenant_id` deben incluir al menos un caso que verifique que un usuario de un tenant
no puede leer ni escribir recursos de otro, incluso conociendo su ID.

## 5. Gestión de secretos

- Ningún secreto (contraseña de DB, clave privada JWT, client secret OAuth, credenciales SMTP) se
  commitea al repositorio. `infra/.env.example` sólo
  documenta nombres de variable y valores de desarrollo claramente no productivos.
- En producción, secretos gestionados por el mecanismo del entorno de despliegue (variables de
  entorno inyectadas por la plataforma o un gestor de secretos dedicado) — nunca en archivos de
  configuración versionados.
- Rotación de la clave de firma JWT (RS256) soportada sin downtime vía múltiples `kid` activos en
  el JWKS (ADR 0005).

## 6. Cabeceras de seguridad y CSP

Cabeceras mínimas en toda respuesta HTTP del backend y en el hosting de cada app frontend:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (sólo servido sobre HTTPS).
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` (o `frame-ancestors 'none'` vía CSP) — ninguno de los tres portales debe
  ser embebible en un iframe de terceros.
- `Content-Security-Policy` estricta por app, sin `unsafe-inline`/`unsafe-eval` en `script-src`;
  `connect-src` restringido al propio backend y a los orígenes de federación (Google/Microsoft/
  Facebook) que cada app realmente use.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` restrictiva por defecto; la app `inspector` habilita explícitamente
  geolocalización/cámara sólo donde el flujo de fiscalización lo requiera (evidencia con ubicación).

## 7. CORS por portal

Cada app (`citizen`, `admin`, `inspector`) tiene su propio origen permitido en el backend; CORS no
es un único wildcard compartido entre los tres. Un origen de `citizen` nunca queda autorizado para
llamar rutas de `/api/v1/admin/**` a nivel de CORS, como capa adicional a la validación de `aud`
del JWT (defensa en profundidad, no sustituye la validación de audiencia).

## 8. Cookies vs almacenamiento de tokens en apps móviles

- Apps web (React + Vite servidas en navegador): preferir almacenamiento en memoria de la SPA para
  el access token (vida corta, 15 min) y, si se usa persistencia entre recargas, un mecanismo que
  minimice exposición a XSS (nunca `localStorage` para el refresh token en la app `admin`, que
  maneja datos más sensibles); cookies `HttpOnly; Secure; SameSite=Strict` son la alternativa
  preferida para el refresh cuando el portal lo permite, evaluada por app en la implementación de
  `packages/auth`.
- Apps Capacitor (`citizen`, `inspector` como app móvil): usar el almacenamiento seguro nativo del
  dispositivo (Keychain en iOS, Keystore/EncryptedSharedPreferences en Android) para el refresh
  token, nunca `localStorage`/`WebView` storage plano.
- En todos los casos, el storage es **aislado por app** (ADR 0004): un compromiso de una app no
  debe exponer el token de otra, aunque ambas corran en el mismo dispositivo/dominio.

## 9. Subida de archivos

Relevante desde v0.4 (evidencia de fiscalización). Reglas mínimas a aplicar cuando se implemente:
validación de tipo MIME real (no sólo extensión), límite de tamaño, almacenamiento fuera del árbol
servible directamente por la aplicación (o con URLs firmadas de corta vida), escaneo/validación de
contenido antes de servir a otro usuario, y nombres de archivo generados por el servidor (nunca el
nombre provisto por el cliente usado como path).

## 10. SSRF en integraciones

Toda integración saliente con URL o endpoint parcialmente controlado por un tercero (webhooks de
proveedores de pago, callbacks OAuth, futuras integraciones de mapas/geocodificación) valida el
destino contra una lista explícita de hosts permitidos por integración; nunca se realiza una
petición saliente a una URL arbitraria construida a partir de input de usuario sin esa validación.
Timeouts explícitos y sin seguir redirecciones a hosts fuera de la lista permitida.

## 11. Protección de datos personales

- **Documento de identidad y fecha de nacimiento son datos sensibles**: acceso restringido a los
  roles que estrictamente lo necesitan (`USER_READ` con alcance de tenant/membresía, nunca
  expuesto en catálogos públicos ni en autocompletados).
- **Minimización**: los DTOs de listado (`GET /admin/users`) no incluyen el documento completo por
  defecto; el detalle completo sólo en `GET /admin/users/{id}` con el permiso correspondiente.
- **IP en auditoría**: se almacena hasheada (`ip_hash`) tanto en `audit_events` como en
  `auth_attempts`/`refresh_tokens`, suficiente para detectar patrones de abuso sin retener la IP
  en claro de forma indefinida.
- **Retención y borrado**: ver ADR 0013; el borrado de datos personales a solicitud de un usuario
  (derecho de supresión, cuando la jurisdicción lo exija) es un flujo explícito que respeta las
  obligaciones legales de retención de registros financieros/auditoría — no un `DELETE` simple de
  la fila de `users` (pendiente de diseño detallado en `docs/ROADMAP.md`, dependiente de
  regulación por país).

## 12. Checklist de revisión previa a producción

- [ ] Claves privadas JWT y secretos fuera del repositorio y del entorno de CI, inyectados por el
      gestor de secretos del entorno de despliegue.
- [ ] Portal de plataforma restringido por IP antes de exponerlo a internet abierto — es lo que
      compensa la ausencia de segundo factor (ADR 0016).
- [ ] Pruebas de integración de aislamiento multi-tenant pasando para cada módulo con `tenant_id`.
- [ ] CORS configurado por origen real de cada app (sin wildcard) en el entorno de producción.
- [ ] CSP sin `unsafe-inline`/`unsafe-eval`, validada contra las tres apps desplegadas.
- [ ] Rate limiting y bloqueo por intentos activo y probado contra `auth_attempts`.
- [ ] `ip_hash` (no IP en claro) verificado en `audit_events`, `auth_attempts`, `refresh_tokens`.
- [ ] Rotación de clave de firma JWT probada sin invalidar sesiones activas.
- [ ] Política de retención de `audit_events` y de datos personales definida y documentada por
      jurisdicción de lanzamiento.
- [ ] Escaneo de dependencias (backend Maven, frontend npm) sin vulnerabilidades críticas abiertas.
- [ ] Headers de seguridad verificados en las tres apps y en el backend con una herramienta externa.
- [ ] Plan de respuesta a incidentes (a quién se notifica, cómo se revocan tokens/sesiones en
      masa) documentado y probado al menos una vez (tabletop).
