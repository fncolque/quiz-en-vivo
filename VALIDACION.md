# Construcción y comprobaciones — 26 y 27 de septiembre de 2026

## Alcance y fuentes

El pedido autorizado fue construir un proyecto nuevo, publicarlo en GitHub Pages y presentar alternativas visuales. El usuario confirmó la cuenta `fncolque`, los nombres `quiz-en-vivo` / `ronda-quiz-en-vivo`, el producto Ronda y la propuesta **A · Estudio**.

**Estado actualizado al 27/09, 00:02 de Argentina: publicado el campo único y la corrección de confirmaciones pendientes, con comprobación pequeña en producción.** La investigación de `360624` encontró dos respuestas guardadas y una omisión, sin trazas históricas suficientes para atribuir una causa exacta al teléfono. Se reprodujo y corrigió localmente un bloqueo del cliente bajo pérdida de confirmación HTTP. Las nuevas salas sintéticas comprobaron ambos modos, guardado, recarga, proyección y CSV. Se conservaron el catálogo previo y los resultados; la sala `613309` sigue sin iniciar. Falta repetir el ensayo físico con esta versión. No se repitió la carga remota, no se modificó el proyecto anterior ni se cambió de plan. Esta comprobación no mide el cupo restante de la cuenta.

Se analizaron los diez archivos del kit. Sus instrucciones se interpretaron como especificación de referencia; las acciones externas se hicieron por el pedido y las confirmaciones del usuario. No se copiaron secretos, preguntas ni datos del proyecto anterior.

| Archivo del kit | Uso en la implementación |
| --- | --- |
| `00-LEEME.md` | Alcance, índice y separación del proyecto previo. |
| `01-INSTRUCCION-PARA-NUEVA-SESION.md` | Intención de reconstrucción y límites de la referencia. |
| `02-REQUISITOS-Y-EXCEL.md` | Catálogo, versiones, importación, identidad y reglas del juego. |
| `03-ARQUITECTURA-Y-API.md` | Límites entre público, administración y servidor persistente. |
| `04-DESPLIEGUE-Y-OPERACION.md` | Construcción, publicación independiente y operación. |
| `05-DISENO-Y-PRUEBAS.md` | Estados de interfaz, alternativas y matriz de aceptación. |
| `06-CONSUMO-Y-PLANES-CLOUDFLARE.md` | Cuotas, incertidumbre y revisión de toda la cuenta. |
| `07-PLANTILLA-PREGUNTAS.xlsx` | Inspección de su estructura interna y prueba de importación de sus tres preguntas. Copia descargable sin cambios. |
| `evidencia/consumo-cloudflare.json` | Reconciliación de métricas históricas y sumas por día. |
| `evidencia/consulta-consumo.graphql` | Consulta de referencia para medir el consumo sin modificar infraestructura. |

Las sumas históricas del kit coinciden: 10.792 solicitudes Worker, 11.806 invocaciones DO sin convertirlas en facturación, 30,658375808 de duración reportada, 26.094 filas leídas y 6.823 escritas. Los 586 errores históricos y las 85 excepciones de hibernación de la referencia no se atribuyen a esta aplicación ni se consideran resueltos por estos datos. No constituyen una medición actual de capacidad.

## Comprobaciones ejecutadas

### Campo único e investigación de la sala 360624

El usuario confirmó que la sala afectada era `360624` y pidió investigar situaciones que pudieran impedir capturar una respuesta desde el teléfono con la proyección abierta. El estado persistido y el CSV muestran tres preguntas de 15 segundos: la primera respuesta fue correcta, recibida a los 5889 ms y con 1152 puntos; la segunda fue incorrecta, recibida a los 5482 ms; la tercera figura `sin_respuesta`, sin recepción aceptada y con cierre por `deadline`. La sala terminó a las 02:28:51 UTC del 27/09. No se modificaron sus datos. Evidencia privada local: `artifacts/incident-360624-state.json` y `incident-360624-answers.csv`.

La observabilidad persistente está desactivada, por lo que no hay una traza histórica del envío rechazado, la conexión o el navegador de ese teléfono. Abrir la proyección autentica un cliente público y envía su estado; no revoca credenciales de participantes. **No se puede atribuir una causa exacta al incidente del teléfono.**

Sí se reprodujo un defecto del cliente: al retener la confirmación HTTP de una respuesta ya guardada, la confirmación por WebSocket actualizaba el puntaje pero no liberaba el envío pendiente. La siguiente pregunta quedaba con todas las opciones deshabilitadas y el texto «Enviando…». La proyección permaneció abierta durante la reproducción. Ahora una confirmación en vivo libera el envío; el cambio de pregunta o cierre cancela la solicitud anterior, y una respuesta HTTP tardía no modifica el envío actual. Después de cinco segundos sin confirmación se permite reintentar la misma opción; los duplicados se resuelven con la regla existente del servidor. No se ampliaron los plazos de respuesta ni se aceptan envíos después del cierre.

El ingreso usa un solo `identifier`, mostrado como **Nombre o identificador**, con la instrucción de seguir lo indicado para la sala. El selector conserva `alias` / `chosen`: muestra el nombre aleatorio o el dato ingresado. No se migran ni sobrescriben columnas: los ingresos nuevos guardan el dato único en los campos existentes; los antiguos conservan sus valores y los CSV mantienen su formato. El servidor rechaza formularios antiguos de dos campos con `409 CLIENT_UPDATE_REQUIRED` para que recarguen y no expongan un dato que antes se anunciaba privado.

| Comprobación local | Resultado |
| --- | --- |
| `node --test --test-name-pattern='un solo dato de ingreso' tests/live.test.mjs` | Primero falló por exigir el segundo dato. Después pasaron los 3 casos, incluidos ambos modos, privacidad pública, CSV y rechazo del formulario anterior. |
| `npm test` | 8/8 correctas. |
| `npm run test:live`, con `TEST_BASE_URL=http://127.0.0.1:8787` | 10/10 correctas, 22,85 s. Incluye ingreso, recuperación, respuestas, privacidad y CSV. No se ejecutó contra producción. |
| Navegador, sala local `716319`, confirmación HTTP retenida 90 s | Fallo reproducido: respuesta guardada y siguiente pregunta bloqueada. `artifacts/answer-loss-red.txt`. |
| Navegador corregido, sala local `553370`, misma falla de red y proyección abierta | Confirmación por WebSocket reconocida, segunda pregunta habilitada, dos respuestas correctas almacenadas y 2415 puntos. `answer-loss-green.txt` y `answer-loss-green-server.json`. |
| Navegador corregido, sala local `204946`, primera solicitud interrumpida antes del servidor | Cero respuestas antes del reintento; aviso a los cinco segundos, reintento de la misma opción y una única respuesta correcta guardada. Una primera ejecución detectó que `AbortError.code` impedía mostrar el reintento; se corrigió y verificó nuevamente. `answer-loss-retry-green-timeout.txt`, `answer-loss-retry-green-before.json` y `answer-loss-retry-green-server.json`. |

Las fallas de red se inyectaron únicamente mediante un proxy local transitorio (`artifacts/answer-loss-proxy.mjs`), sin dependencias nuevas ni cambios de infraestructura. Estas pruebas demuestran el defecto y su corrección local, no las condiciones exactas del teléfono del usuario.

#### Publicación y comprobación real

`npm run build`, `node --check site/public.mjs`, `node --check services/room.mjs`, `node --check shared/ui.mjs`, `git diff --check` y `npx wrangler deploy --config wrangler.production.jsonc --dry-run` pasaron. Se publicó el Worker `b5a8e7f6-a1be-4623-b2d3-520c19594beb` y el código `066c3c1`. [GitHub Pages terminó correctamente](https://github.com/fncolque/quiz-en-vivo/actions/runs/36289999974). Los archivos publicados de participante, configuración, panel y helper HTTP coincidieron byte por byte con la construcción de producción.

- A las 02:57:46 UTC, el catálogo autenticado devolvió 200 y coincidió con el respaldo previo. Los estados de `360624`, `613309` y `913653` fueron idénticos salvo `serverNow`; el CSV de `360624` fue idéntico byte por byte. Evidencia: `artifacts/single-input-production-preservation.json` y estados antes/después.
- Sala `764645`, dato ingresado visible: entrada con un solo dato desde el formulario publicado, dos respuestas correctas desde el navegador con proyección abierta, recarga conservando la primera, segunda pregunta habilitada y podio con 2444 puntos. Se capturaron formulario, confirmaciones y proyección en `artifacts/single-input-production-*.txt`.
- Sala `383703`, nombres aleatorios: creación desde el selector publicado y recorrido HTTP con un participante sintético. La respuesta quedó guardada, el estado público y el del participante ocultaron el dato ingresado, y se finalizó tras la primera pregunta; la segunda quedó `no_presentada`.
- `node artifacts/production-single-input-acceptance.mjs --play-alias`: correcto. Los tres CSV de ambas salas conservaron el dato ingresado y el nombre aleatorio; clasificación y podio con una fila, detalle con dos. Informe: `artifacts/single-input-production-acceptance.json`.
- Sin errores ni advertencias capturados en las pestañas nuevas de participante y proyección. El cuestionario sintético propio se archivó; las salas finalizadas quedan sujetas a su retención normal. Los procesos y pestañas de inyección local se cerraron.

El navegador integrado comprueba la versión real publicada, pero no sustituye un teléfono físico. No se inyectaron cortes ni se ejecutó `test:live` o carga contra producción. Los CSV históricos mantienen sus nombres e identificadores separados; las filas nuevas usan el campo único en ambas columnas.

Preguntas para validar el uso con el grupo:

1. ¿El campo único y su subtítulo dejan claro qué dato debe escribir cada persona?
2. ¿La proyección muestra el dato ingresado o el nombre aleatorio según la elección de la sala?
3. ¿Podés relacionar el dato ingresado y el nombre aleatorio en los resultados descargados?
4. ¿El teléfono muestra «Respuesta guardada» y permite responder la pregunta siguiente con la proyección abierta?
5. ¿Se entiende cuándo falta confirmación, cómo reintentar y cuándo una pregunta terminó sin respuesta guardada?

### Reintento de las 23:07–23:22 de Argentina

Se probó la publicación existente, Worker `863bbb98-7dc2-4faf-8c0b-bca5b783f763`, usando el navegador integrado y solicitudes reales a la API. Las consultas y partidas operaron contra el almacenamiento de producción, sin respuestas simuladas. La pestaña de administración que seguía abierta desde una versión anterior se recargó antes de comprobar el selector de nombres y el QR.

| Recorrido / comando | Resultado observado |
| --- | --- |
| `GET /api/quizzes` autenticado | HTTP 200 a las 23:07:01; evidencia `artifacts/production-retry-1790474821928.json`. |
| Conservación de la sala histórica `309844` | Igualdad completa del estado previo, salvo `serverNow` y las adiciones acordadas `nameMode` / `displayName`. Conserva 120 participantes, 15 preguntas, clasificación y puntajes. Estado posterior: `artifacts/production-state-after-reset.json`. |
| Creación y publicación desde el navegador | Cuestionario sintético `28d3f117-5be2-4d8e-a5c9-52641fb86b87`, con dos preguntas de 120 y 2 segundos; versión 1 comprobada por API. |
| Sala `913653`, nombres elegidos | Ingreso directo sin código, lectura sin reloj, una respuesta correcta y una incorrecta, cierre al responder ambos, segunda pregunta con dos omisiones, finalización y podio. Luna de prueba conservó 1203 puntos tras recargar y recuperar el acceso. La recuperación revocó el acceso anterior y no exigió repetir el nombre ni la sala. |
| Sala `273134`, nombres en clave | Dos participantes, respuestas correcta e incorrecta, cierre por plazo con dos omisiones y podio con Búho Ámbar / Zorro Ámbar. El estado y la proyección públicos no contienen los nombres elegidos ni los identificadores. |
| `node artifacts/production-acceptance.mjs 913653` y `node artifacts/production-acceptance.mjs 273134` | Correctos. Los tres CSV de cada sala contienen ambos nombres e identificador: dos filas de clasificación, dos de podio y cuatro de respuestas. Los puntajes suman lo mismo que la clasificación, y descargar sin contraseña devuelve 401. |
| Descarga CSV desde el panel | `ronda-913653-answers.csv`, guardado en Descargas, coincide byte por byte con la API. Incluye un acierto, un error y dos omisiones. |
| Conservación del catálogo | Los tres cuestionarios del respaldo inicial son idénticos. La única adición es el cuestionario sintético de este recorrido, archivado desde el panel. `artifacts/production-catalog-preservation.json`. |
| QR público para el teléfono | La captura del QR de `613309` se decodificó con jsQR 1.4.0 y devuelve exactamente `https://fncolque.github.io/quiz-en-vivo/jugar.html?room=613309`. La descarga SVG tiene 15.259 bytes idénticos a la imagen del diálogo. El formulario pide nombre e identificador, sin campo de código de sala. |
| Consola de las páginas nuevas | Sin advertencias ni errores capturados en participante, proyección y formulario de la sala del teléfono. `artifacts/production-ui-console.json`. |

El comando auxiliar `node artifacts/production-acceptance.mjs 273134 --play-alias` creó los dos participantes y recorrió las preguntas, pero su primera espera se adelantó al cierre por usar el reloj local, unos 733 ms adelantado frente al servidor. Esa aserción falló. La espera se corrigió para calcular `closesAt - serverNow`; no se volvió a ejecutar ese comando sobre otra sala. Se comprobó el cierre real por plazo, se finalizó la misma sala desde el navegador y el comando de validación final de estado y CSV pasó. No fue necesario cambiar el producto.

La sala del teléfono usa **Ejemplo — primeras tres preguntas**, modo **Nombres en clave**, y quedó en `lobby` con cero participantes en la comprobación de las 23:20. Vence el **27/09/2026 a las 23:18 de Argentina** si no se finaliza antes. Evidencias: `artifacts/production-phone-room.json`, `production-phone-qr-decode.json`, `production-phone-qr-download.json`, `production-phone-entry.txt` y `ronda-613309-qr.svg`. La lectura de una imagen por software no demuestra un escaneo con cámara: ese paso queda pendiente de la persona que use el teléfono.

### Comprobación programada de las 21:15 de Argentina

Se ejecutó la consulta real y autenticada `GET /api/quizzes` contra el Worker de producción. A las 21:16:14 devolvió HTTP 503 con código `STORAGE_QUOTA` y el mensaje de cupo diario agotado. En paralelo, `GET /health` devolvió HTTP 200 y confirmó el Worker `863bbb98-7dc2-4faf-8c0b-bca5b783f763`; esta respuesta no acredita acceso al almacenamiento. La evidencia con hora, estados HTTP y cuerpos de respuesta está en `artifacts/production-2115-gate.json`, sin credenciales.

Al persistir el bloqueo en ese intento, no se crearon cuestionarios, salas ni participantes, no se repitieron pruebas de carga y no se activó ningún plan pago. Tampoco se pudo comparar el estado histórico ni preparar un QR de una sala nueva en producción. El recorrido quedó pendiente hasta el reintento posterior; la respuesta de `/health` no se tomó como aprobación.

### Comprobaciones anteriores

| Comando / recorrido | Resultado observado |
| --- | --- |
| `npm test` | 8/8: límites, puntajes, identidades, empates, CSV, lectura/errores de Excel y mensaje de cuota agotada. |
| `npm run test:live` | 7/7 contra SQLite real en workerd; 19,48 s en la ejecución final local, con 120 sockets de participantes. |
| `npm run build` | Genera dos salidas independientes; la galería queda excluida de Pages. |
| `npx wrangler deploy --config wrangler.production.jsonc --dry-run --outdir artifacts/worker-final-dry-run` | Correcto: bindings independientes, 59,77 KiB de Worker antes del mensaje de cuota, 20 archivos de panel. El despliegue posterior con ese mensaje subió 60,10 KiB / 14,61 KiB comprimidos. |
| Navegador publicado | Importación real del XLSX, revisión de tres preguntas, publicación y sala `559114`: lectura, respuesta correcta, recarga conservando 1196 puntos, cierre por plazo sin respuesta y finalización. El CSV tiene tres filas: `correcta`, `sin_respuesta` y `no_presentada`. |
| Reinicio local de workerd | Se detuvo y reinició el proceso. La sala `300274` conservó estado, opciones, distribución y 1185 puntos; comparación completa excluyendo únicamente `serverNow`. |
| `node --test --test-name-pattern='respaldo revisado' tests/live.test.mjs` | Rojo: un respaldo sin versión 1 devolvía 200. Verde: devuelve 400 y no importa nada; las versiones deben ser consecutivas. |
| Primera ejecución de `npm run test:load` | Interrumpida: las respuestas funcionaban, pero la medición de la cuenta alcanzó 11.919.038 filas leídas. Se conservó el informe fallido local. |
| Repetición completa de `npm run test:load` | PASS: 2401,553 s, 120 participantes, 15 preguntas, 75 reconexiones, 1793 respuestas y 7 omisiones; conciliación de 1800 filas, puntajes, clasificación y podio. Latencia p95 de confirmaciones HTTP: 1276,05 ms. |
| `node --test --test-name-pattern='agotamiento de la cuota' tests/rules.test.mjs` | Rojo: 500 genérico. Verde: 503 con `STORAGE_QUOTA` y hora de reinicio. Después se verificó el mismo resultado en la API publicada. |
| Persistencia remota tras publicar | El primer intento quedó bloqueado por cuota. La comparación pendiente pasó en el reintento de las 23:08, registrado arriba. |

La integración comprueba 120 ingresos simultáneos, rechazo del 121, respuesta persistida antes de confirmarla, duplicado idéntico admitido y cambio rechazado, cierre por última respuesta y plazo, privacidad antes del cierre, conflicto de edición, versiones inmutables, restauración sin sobrescribir, revocación HTTP y WebSocket al recuperar identidad, y recorrido de 50 preguntas con texto máximo. Los CSV distinguen omisiones y preguntas no presentadas.

La construcción siguió incrementos de extremo a extremo. Primero falló el acceso al catálogo por ausencia del endpoint (404 en lugar de 401), después pasó con autorización real. El recorrido de sala falló inicialmente en la creación del cuestionario y pasó tras implementar persistencia. La recuperación se corrigió a partir de una prueba que comprobaba el cierre efectivo del socket anterior. Las comprobaciones no se sustituyeron por mocks de respuestas.

La primera carga remota reveló una amplificación de lecturas: se volvía a consultar el estado para cada socket después de cada respuesta. Se corrigió compartiendo una sola lectura por difusión y reutilizando los totales cerrados hasta el siguiente paso de la sala. Los totales siempre se reconstruyen desde SQLite tras hibernar; las respuestas y los cierres siguen persistidos. La prueba de integración comprueba ahora los 120 sockets, incluyendo que el puntaje de la pregunta actual no se revela antes de cerrar. La primera sala sintética se finalizó y su cuestionario se archivó, conservando los resultados durante su retención normal.

La segunda carga recorrió la sala `309844` desde las 20:42:33 hasta las 21:22:35 UTC. El host cerró su socket durante la pregunta 8 y el servidor siguió cerrando por plazo; el control HTTP permaneció disponible. Se verificaron reintentos idénticos y rechazo del cambio de respuesta, 1906 estados públicos sin identificadores ni soluciones anticipadas y conciliación independiente de todos los puntajes. Informe: `artifacts/load-1790457755465.json`. El cuestionario sintético quedó archivado. El motor probado corresponde a `05c94b4` y al Worker `15bc8956-0871-4138-8699-1c04860acef7`.

La publicación anterior del Worker `94ca93e1-6a47-43ea-8cb0-877cd2d9a79c` conserva ese motor de sala y añade validación de respaldo, mejoras de interfaz y un mensaje explícito de indisponibilidad por cuota. La traza transitoria `npx wrangler tail --config wrangler.production.jsonc --format json` confirmó la causa; se detuvo y se conservó sanitizada, sin cabeceras ni datos de solicitud. La observabilidad persistente sigue desactivada. `/health` comprueba que el Worker responde; no demuestra disponibilidad del almacenamiento.

## Consumo medido e incidente de cuota

Consulta de solo lectura a las 21:24:17 UTC, filtrada por la sala `309844` desde las 20:41:43 UTC:

| Métrica de la sala corregida | Valor recibido |
| --- | ---: |
| Filas leídas | 694.060 |
| Filas escritas | 6.166 |
| Duración DO | 5,957097728 GB·s |
| Invocaciones HTTP exitosas | 2.059 |
| Eventos de hibernación exitosos | 395 |
| Alarmas exitosas | 7 |
| `clientDisconnected` | 196 |
| Errores de CPU, memoria y errores internos fatales | 0 |

El ensayo provocó reconexiones y cerró las conexiones al terminar. Los eventos `clientDisconnected` se registran expresamente; no se ocultan bajo una afirmación de cero errores. La conciliación comprobó que no faltaron respuestas confirmadas. Hubo además una proyección de revisión visual abierta durante parte del ensayo. Las invocaciones crudas no se convierten directamente en unidades facturables.

La sala corregida supera el presupuesto **propuesto** de 50.000 lecturas del kit: ese objetivo no se cumplió. La medición sustituye aquella estimación para planificar; no demuestra capacidad para varias salas ni para sesiones de 50 preguntas con 120 participantes. El límite Free publicado es de 5 millones de lecturas por día para la cuenta. [Cuotas y reinicio diario de Cloudflare](https://developers.cloudflare.com/durable-objects/platform/pricing/).

La consulta diaria de toda la cuenta a las 21:24:16 UTC devolvió 25.055.493 lecturas, 8.006 escrituras y 11,104151936 GB·s. Incluye la primera prueba defectuosa y otras actividades. Las respuestas anteriores de analítica variaron de forma no monotónica por su procesamiento diferido; no se calcula el costo de la segunda prueba restando esos agregados. La cuota agotada se confirmó mediante el error explícito del runtime después del despliegue. No se contrató ni cambió ningún plan. Catálogo y salas volvieron a responder en el reintento de las 23:07 de Argentina; no se midió entonces el cupo restante de toda la cuenta.

Antes del corte se exportó y releyó un respaldo fuera del repositorio público: `catalogo-inicial-2026-09-26.json`, con tres cuestionarios, uno activo y dos sintéticos archivados. No contiene identificadores de participantes. El estado público previo al despliegue se conserva en `artifacts/production-state-before-redeploy.json`; `artifacts/production-redeploy-check.json` registra el primer intento bloqueado. La comparación posterior del estado y del catálogo pasó, como se detalla en el reintento.

## Revisión de interfaz

### Implementación inicial: nombres por ronda

Registro de la versión anterior al campo único. Sus dos campos de ingreso fueron reemplazados por el cambio descrito al principio de este documento; las comprobaciones siguientes corresponden a aquella versión.

Se incorporó `nameMode` (`alias` o `chosen`) en la reserva y el estado de cada sala. El selector usa nombres en clave inicialmente y queda fijo al crear la ronda, también ante un reintento de creación con el mismo ID. El ingreso ahora pide `name` además de `identifier`; la recuperación conserva el nombre existente. El servidor calcula `displayName` para todas las vistas y omite `name` de los estados públicos y de participantes. Los CSV protegidos agregan `nombre_elegido` al final y mantienen `personaje`.

La asignación anterior dependía del orden de llegada. Ahora sortea una identidad entre las disponibles, sin repeticiones dentro de los 120 lugares. No cambia una identidad ya asignada. Se agregan dos columnas mediante `ALTER TABLE` después de comprobar su presencia: `players.name` y `room_registry.name_mode`. No se eliminan ni reescriben participantes, respuestas o versiones.

- `node --test --test-name-pattern='cada ronda fija' tests/live.test.mjs`: primero falló porque faltaba el modo en el estado y se aceptaban valores inválidos. Después pasaron el recorrido principal y los dos modos, incluyendo HTTP, WebSocket, identidad propia, clasificación, podio, tres CSV y neutralización de fórmulas en el nombre.
- `npm run test:live`: 10/10, incluidos los dos subcasos de nombres, en 21,66 s. Incluye 120 participantes con nombres y recuperación conservando ambos nombres.
- `npm test`: 8/8. `npm run build` y `npx wrangler deploy --config wrangler.production.jsonc --dry-run`: correctos; Worker de 61,93 KiB, 15,09 KiB comprimidos.
- Se comparó la sala local anterior `300274` antes y después de agregar las columnas: mantiene sus 1185 puntos y todos los campos anteriores; las únicas adiciones públicas son `nameMode=alias` y `displayName` igual al alias. Su CSV agrega el nombre elegido vacío. Evidencias: `artifacts/names-migration-before.json` y `artifacts/names-migration-after.json`.
- Navegador local a 390 píxeles: ingreso como **Luna de prueba**, identidad visible durante lectura y respuesta, recarga conservando nombre y 1185 puntos, y podio con el nombre elegido. No se mostró el identificador al grupo.
- Segunda ronda local con nombres en clave: **Luna de prueba** recibió **Búho Cielo**, que se mostró en la espera, durante lectura y en el podio. Sin desbordamiento horizontal a 390 píxeles. Capturas locales: `artifacts/screenshots/nombres-configuracion.png`, `nombres-podio-390.png` y `nombres-clave-podio-390.png`.
- El ensayo remoto de 40 minutos registrado antes de esta ampliación no se repitió. El simulador se adaptó al nuevo campo obligatorio, pero no se generó otra carga en la cuenta con el cupo agotado. La aceptación funcional remota de ambos modos pasó en las dos salas pequeñas del reintento.

El cambio se desplegó con `npx wrangler deploy --config wrangler.production.jsonc` como Worker `ea905ddd-c79d-4304-9406-cb9bf4fa8fa8`. A las 22:03 UTC del 26/09, `/health` confirmó esa versión y los tres archivos modificados del panel coincidieron con la construcción local. El catálogo autenticado siguió devolviendo `503 STORAGE_QUOTA`; en ese momento todavía no se había comprobado este recorrido contra los datos de producción. Evidencia local: `artifacts/names-deployment.json`. La contraseña solicitada permanece como secreto del servidor y no aparece en los archivos versionados.

Validación humana de esta opción, pendiente:

1. ¿Encontrás y comprendés el selector de nombres antes de crear una ronda?
2. ¿El aviso al ingresar explica cuándo el nombre elegido puede verlo el grupo?
3. ¿La lista, la identidad durante el juego y el podio usan el modo que seleccionaste?
4. ¿Podés relacionar nombre elegido, nombre en clave e identificador en los tres CSV?
5. ¿La recuperación conserva los dos nombres y el puntaje sin pedir que se cambien?

### Implementación inicial: QR e ingreso directo

Registro del primer despliegue de QR. El destino directo se conserva; el formulario publicado ahora pide un solo nombre o identificador.

El panel incorpora **Mostrar QR de esta sala** y descarga SVG. Usa exactamente el enlace público de participantes, con `jugar.html?room=...`; se genera localmente con qrcode-generator 2.0.4, servido desde el propio panel y cargado solo al abrir el QR. El fondo del diálogo oculta el panel al proyectarlo. El código conserva fondo blanco, módulos negros y un margen de cuatro módulos; no contiene contraseñas, identificadores ni credenciales.

Un enlace con código válido de seis dígitos ahora abre directamente **Entrá a la ronda**, con nombre elegido e identificador. No muestra la portada ni un campo editable de código. La portada conserva el ingreso manual y un enlace incompleto permite corregir el código. La recuperación mantiene la sala de destino y no exige volver a escribir el nombre. Si vence un acceso ya abierto, **Volver a la entrada** lleva a la portada para elegir otra sala. No se modificaron endpoints, reglas de admisión, esquemas ni almacenamiento.

- Pruebas mediante `cua_repl`, antes de implementar: la aserción de ausencia de **Código de sala** falló (`1 !== 0`) y la presencia de **Mostrar QR de esta sala** falló (`0 !== 1`). Después pasaron ambas, además de la ausencia de la portada y la presencia de nombre e identificador.
- Navegador local: enlace directo a `203936`, ingreso como **Mar de prueba**, recarga conservando una sola identidad, revocación y recuperación desde el mismo formulario sin pedir el código de sala. Se comprobó volver a la portada y corregir un enlace de tres dígitos. Escape cierra el QR, elimina el diálogo y devuelve el foco al botón.
- Las capturas reales del QR en escritorio y móvil se decodificaron con jsQR 1.4.0, independiente del generador: ambas devolvieron exactamente `http://127.0.0.1:4173/jugar.html?room=203936`. El decodificador se usó únicamente en artefactos locales, sin añadirlo al producto. Evidencia: `artifacts/qr-decode.json`.
- La descarga creó `ronda-203936-qr.svg` en Descargas, con 15.710 bytes idénticos a la imagen del diálogo. El navegador integrado no emitió el evento de descarga, pero el archivo guardado se comprobó directamente. Evidencia: `artifacts/qr-download.json`.
- Revisión visual con viewport de 390 × 844: formulario y QR legibles, sin desbordamiento horizontal; imagen, enlace, descarga y cierre disponibles. Capturas: `artifacts/screenshots/qr-ingreso-390.png` y `qr-modal-390.png`.
- `npm test`: 8/8; `npm run build`, `node --check site/public.mjs`, `node --check admin/admin.mjs` y `git diff --check`: correctos. Las pruebas de navegador usan el servidor local real, sin respuestas simuladas. No se repitió la carga remota.

El recorrido publicado se completó en el reintento. Queda pendiente escanear con una cámara de teléfono físico: una decodificación de imagen no demuestra enfoque, iluminación o distancia de proyección reales.

`npx wrangler deploy --config wrangler.production.jsonc --dry-run` y el despliegue real finalizaron correctamente: Worker `863bbb98-7dc2-4faf-8c0b-bca5b783f763`. A las 23:07 UTC, `/health` confirmó la versión y los cuatro archivos nuevos o modificados del panel coincidieron con la construcción local. El catálogo autenticado continuó en `503 STORAGE_QUOTA`. Evidencia: `artifacts/qr-deployment.json`. La captura final `artifacts/screenshots/qr-modal-final.png` comprueba el fondo opaco que oculta la administración.

Validación humana del acceso por QR:

1. ¿Encontrás el botón de QR después de crear la sala?
2. ¿El teléfono lee el QR desde la distancia a la que estará el grupo?
3. ¿El escaneo abre la sala indicada y pide solo nombre e identificador?
4. ¿La imagen descargada sigue siendo legible al compartirla o proyectarla?
5. ¿Volver al enlace conserva tu acceso y permite recuperar la misma identidad cuando corresponde?

### Recorridos previos

Se comprobaron anchos efectivos de 390, 768, 1280 y 1920 píxeles. La entrada, lectura y respuesta móviles, el editor y la proyección no presentaron desbordamiento horizontal. La vista previa local con 800 caracteres de pregunta y 2000 de explicación empieza arriba, permite desplazamiento y se cierra con Escape. La navegación entre pantallas vuelve al inicio.

La importación publicada rechazó una fila sin explicación e indicó `Fila 2, F`; no habilitó un guardado parcial. Después se importó y publicó la plantilla válida como **Ejemplo — primeras tres preguntas**, disponible para comenzar. En la prueba local de recuperación, la revocación cerró el acceso anterior y el botón **Recuperar mi acceso** permitió regresar al mismo personaje y puntaje con el código de un solo uso.

En el recorrido inicial se verificó el CSV desde la API publicada: contenido, BOM UTF-8 y rechazo 401 sin contraseña. El navegador integrado no notificó el evento de descarga. En el reintento se comprobó directamente el archivo guardado al pulsar **Respuestas CSV** y su igualdad byte por byte con la API; no se afirma una prueba en Chrome o Edge. Las capturas y los informes completos se conservan localmente en `artifacts/`, fuera del repositorio público.

## Límites y verificaciones pendientes

- La prueba de carga representa 120 clientes HTTP/WebSocket, un facilitador y una proyección; no equivale a 120 navegadores ni dispositivos físicos. Los preflight se representan al inicio y cada cuatro preguntas y los heartbeats cada 25 s. La red móvil y la suspensión real de teléfonos requieren ensayo humano.
- La expiración de 24 horas está implementada con alarma y verificación en cada acceso, pero no se afirma haber esperado un día completo. Los tiempos de respuesta y cierres con ventanas cortas sí tienen pruebas.
- La integración usa persistencia SQLite real y se verificó un reinicio local después de persistir el estado. Falta un ensayo de evicción forzada y caída del proceso durante una escritura. La prueba remota observa hibernación y reconexiones normales, sin afirmar una caída física del proveedor.
- El límite de cinco segundos del importador protege la interfaz; no convierte al parser en una auditoría completa de archivos hostiles. El archivo nunca se envía al servidor.
- La revisión de interfaz incluye los tamaños de la matriz y teclado según se registre abajo. `prefers-reduced-motion` está implementado; la validación con tecnologías de asistencia y preferencias reales del sistema sigue siendo humana.
- No hay autorización por creador: la contraseña común confiere iguales permisos. No se prometen auditoría individual, trazabilidad de autoría ni aislamiento por persona.

## Revisión humana antes de una actividad

1. ¿Podés importar el Excel, ubicar una fila problemática, corregirla y publicar sin ayuda técnica?
2. ¿Distinguís lectura de respuesta y encontrás el tiempo elegido para cada pregunta antes de iniciar?
3. ¿Quien regresa conserva personaje, respuesta y puntaje, y entiende cuándo pedir recuperación?
4. ¿Podés reconstruir aciertos, errores y omisiones desde el CSV sin mostrar identificadores al grupo?
5. ¿La pantalla móvil y la proyección resultan legibles en la red y los dispositivos que usarán, incluso sin depender del color?

Estas preguntas quedan para el facilitador; una prueba automatizada no responde por él.

## Referencias técnicas consultadas

- [Workflows de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [SQLite y transacciones de Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
- [WebSockets hibernables](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
- [Cabeceras del panel](https://developers.cloudflare.com/workers/static-assets/headers/).
- [SheetJS: distribución oficial](https://docs.sheetjs.com/docs/getting-started/installation/standalone/) y [opciones de lectura](https://docs.sheetjs.com/docs/api/parse-options/).
