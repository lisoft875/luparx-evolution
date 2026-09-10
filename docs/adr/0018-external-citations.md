# 0018 — Boletas levantadas en otro sistema

- **Estado**: Aceptado
- **Fecha**: 2026-09-10
- **Amplía**: [0014](0014-enforcement-bounded-context.md)

## Contexto

Una municipalidad que ya emite y cobra multas en su propio sistema no va a apagarlo el día que
contrata LupaRX. Va a querer que sus boletas se vean aquí —el ciudadano que consulta su placa, el
inspector que revisa un carro, la oficina que contesta el teléfono— mucho antes de mover el cobro.

El modelo de `citations` (V17_0) ya cubre las nueve viñetas del punto 9 del pliego: placa, inspector
con nombre congelado, causal con código/nombre/monto copiados, dos relojes, zona/bahía/coordenadas/
dirección, evidencia, observaciones, consecutivo y máquina de estados. Lo que no cabía era una boleta
que **nació en otro lado**: la tabla exige un inspector que sea usuario de la plataforma, exige una
causal del catálogo propio, y su número sale de la serie propia.

La salida fácil —«que el integrador invente un inspector y mapee la causal a la más parecida»— llena
de datos falsos justamente las tres columnas por las que después pregunta un auditor.

---

## Decisión 1 — El origen decide quién es dueño del ciclo de vida

`citations.source` con dos valores:

- `LUPARX`: el acto se levantó aquí. La plataforma lo emite, lo numera, lo mueve, lo cobra y responde
  por él.
- `EXTERNAL`: el acto se levantó en otro sistema y esta fila es un **espejo**. Se lee, se busca y se
  muestra; no se paga aquí, no se mueve aquí y no se apela aquí.

No es una etiqueta de pantalla: es lo primero que pregunta cada guarda del servicio.

### Por qué el espejo no cobra

Porque la alternativa es una municipalidad con dos respuestas a «¿pagó este ciudadano?» y ninguna
forma de saber cuál es la verdadera. Una plataforma que acepta un pago por un acto que no emitió le
debe un mensaje al otro sistema, y el día que ese mensaje falle alguien pagó y sigue debiendo.
Negarse es la posición honesta mientras el que cobra es el otro.

### Cómo crece sin reescribirse

El día que una municipalidad quiera que LupaRX cobre boletas que no emitió, lo que hace falta es un
dueño del cobro declarado por municipalidad y una llamada de vuelta al otro sistema — no una
reescritura: **todo cambio de estado ya pasa por un solo método** (`CitationService.transition`), que
es donde vive la regla. Esa es la razón de poner el guarda ahí y no en cada llamador.

---

## Decisión 2 — Tres exigencias se aflojan sólo para lo externo

`inspector_user_id` e `infraction_type_id` dejan de ser `NOT NULL`, y en su lugar entra un CHECK
consciente del origen:

```sql
CHECK (source <> 'LUPARX' OR (inspector_user_id IS NOT NULL AND infraction_type_id IS NOT NULL))
```

Es **más exacto** que los `NOT NULL` que reemplaza, porque la regla nunca fue «toda boleta tiene
inspector» sino «toda boleta *nuestra* tiene inspector». Lo mismo con el consecutivo: `number` es lo
que el ciudadano cita, y para una boleta externa eso es el número del otro sistema; `series_year` y
`sequence_number` son de nuestra serie y una boleta externa no los tiene. Quemar un consecutivo
nuestro en un acto que no levantamos dejaría un hueco en nuestro propio libro.

---

## Decisión 3 — La causal entra tal cual y se mapea después

El código, el nombre y el monto de la infracción **ya se copiaban dentro de la boleta** desde V17_0,
porque el catálogo es configuración y se edita. Ese snapshot es justo lo que hace que una causal ajena
quepa sin tocar nada: entra completa, y lo único que falta es el enlace al catálogo.

`external_infraction_mappings` lo agrega **después y sin bloquear**. Un ingreso nunca se rechaza por
falta de mapeo: las boletas de una municipalidad llegando a las dos de la mañana no pueden depender de
que alguien haya configurado una tabla de traducción primero — un rechazo a esa hora es una boleta que
nadie se entera que se perdió, y el otro sistema tampoco sabe qué hacer con el error.

Al mapear se enlazan también las que ya estaban, por lotes (`relinked` / `more`), porque encender el
espejo importa el libro completo de la municipalidad y un código puede estar en miles de filas.

El mapeo **no corrige el acto**: el código, el nombre y el monto se quedan como llegaron. Es para que
los reportes sumen, nada más.

---

## Decisión 4 — Idempotencia en la base, no en el método

La identidad de una boleta espejo es `(municipalidad, sistema, id externo)`, y es un índice único.

No es cinturón y tirantes: el otro sistema **va a reenviar** —tras un timeout cuya respuesta nunca
vio, como reenvío nocturno de todo su libro abierto, o simplemente dos veces— y con dos instancias
detrás del balanceador dos de esos llegan a dos procesos que ambos no encuentran nada y ambos
insertan. El índice es lo que lo resuelve; atrapar su violación y releer la fila es lo que convierte
una carrera en la respuesta correcta en vez de un 500 que el integrador tiene que interpretar.

Un reingreso actualiza el estado, la palabra del otro sistema, la fecha límite y el monto. **No**
toca placa, causal, lugar, momento ni inspector: un ingreso que pudiera reescribir eso sería un canal
para editar historia desde afuera, y espejar existe precisamente porque no somos nosotros los que
decidimos. Lo que llegue distinto se **reporta** (`discrepancies`) para que lo resuelva una persona;
dos sistemas en desacuerdo sobre a qué placa multaron no es un conflicto de merge.

---

## Decisión 5 — Una capacidad y un rol nuevos

`CITATION_INGEST`, y el rol `TENANT_INTEGRATION` que sólo tiene esa y `CITATION_READ`.

Deliberadamente **no** es `CITATION_ISSUE`: espejar un acto que levantó otro no es la misma autoridad
que levantar uno en nombre de esta municipalidad, y una integración mal configurada con la capacidad
del inspector podría emitir boletas de verdad sobre placas de verdad. Sin un rol para la integración,
lo que pasa siempre es que se le entregan credenciales de administrador.

El endpoint vive bajo el portal de administración porque el que habla es una máquina **de una
municipalidad**, y toda la garantía que importa —tenant del contexto, audiencia del token, auditoría—
ya cuelga de ese portal. Una ruta de primer nivel habría significado una segunda forma de establecer
qué municipalidad habla, y dos formas de contestar esa pregunta es como una plataforma multi-tenant
termina sirviéndole a un municipio las boletas de otro.

---

## Consecuencias

- Una municipalidad puede conectar su sistema actual sin cambiar nada de cómo cobra hoy, y ver todo
  en un solo lugar desde el primer día.
- Las tres apps dicen de dónde viene cada boleta, y la del ciudadano le dice dónde pagarla en vez de
  mostrarle un botón que no funciona.
- La base impide que una boleta espejo quede pagada aquí sin que el otro sistema lo haya dicho.
  Eso no es una validación de pantalla: es plata.
- Queda pendiente, cuando haga falta: dueño del cobro configurable, devolución de estado al otro
  sistema, e importación por archivo para la carga inicial del histórico.
