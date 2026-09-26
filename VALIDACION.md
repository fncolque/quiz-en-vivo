# Construcción y comprobaciones — 26 de septiembre de 2026

## Alcance y fuentes

El pedido autorizado fue construir un proyecto nuevo, publicarlo en GitHub Pages y presentar alternativas visuales. El usuario confirmó la cuenta `fncolque`, los nombres `quiz-en-vivo` / `ronda-quiz-en-vivo`, el producto Ronda y la propuesta **A · Estudio**.

**Estado final de esta ejecución: publicado, temporalmente sin servicio de datos.** A las 21:28 UTC (18:28 de Argentina) del 26/09, el catálogo y las salas devuelven `503 STORAGE_QUOTA`. La primera prueba agotó el cupo diario de lecturas de la cuenta. El runtime confirmó el límite Free; la lectura de suscripciones no estaba autorizada. El reinicio previsto es el 27/09 a las 00:00 UTC, equivalente al 26/09 a las 21:00 de Argentina. La comprobación remota posterior al despliegue queda pendiente hasta que vuelva el servicio. El límite compartido puede afectar también al proyecto anterior, cuyo código y datos no se modificaron.

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
| Persistencia remota tras publicar | Bloqueada por cuota. Se guardó el estado completo antes del despliegue; la consulta posterior recibió el error del proveedor. No se presenta como aprobada. |

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

La consulta diaria de toda la cuenta a las 21:24:16 UTC devolvió 25.055.493 lecturas, 8.006 escrituras y 11,104151936 GB·s. Incluye la primera prueba defectuosa y otras actividades. Las respuestas anteriores de analítica variaron de forma no monotónica por su procesamiento diferido; no se calcula el costo de la segunda prueba restando esos agregados. La cuota agotada se confirmó mediante el error explícito del runtime después del despliegue. No se contrató ni cambió ningún plan. No deben iniciarse más sesiones hasta comprobar que el cupo se restableció y que catálogo y salas responden.

Antes del corte se exportó y releyó un respaldo fuera del repositorio público: `catalogo-inicial-2026-09-26.json`, con tres cuestionarios, uno activo y dos sintéticos archivados. No contiene identificadores de participantes. El estado público completo previo al despliegue queda en `artifacts/production-state-before-redeploy.json` para compararlo tras el reinicio; `artifacts/production-redeploy-check.json` registra la comprobación actualmente bloqueada.

## Revisión de interfaz

### Ampliación: nombres por ronda

Se incorporó `nameMode` (`alias` o `chosen`) en la reserva y el estado de cada sala. El selector usa nombres en clave inicialmente y queda fijo al crear la ronda, también ante un reintento de creación con el mismo ID. El ingreso ahora pide `name` además de `identifier`; la recuperación conserva el nombre existente. El servidor calcula `displayName` para todas las vistas y omite `name` de los estados públicos y de participantes. Los CSV protegidos agregan `nombre_elegido` al final y mantienen `personaje`.

La asignación anterior dependía del orden de llegada. Ahora sortea una identidad entre las disponibles, sin repeticiones dentro de los 120 lugares. No cambia una identidad ya asignada. Se agregan dos columnas mediante `ALTER TABLE` después de comprobar su presencia: `players.name` y `room_registry.name_mode`. No se eliminan ni reescriben participantes, respuestas o versiones.

- `node --test --test-name-pattern='cada ronda fija' tests/live.test.mjs`: primero falló porque faltaba el modo en el estado y se aceptaban valores inválidos. Después pasaron el recorrido principal y los dos modos, incluyendo HTTP, WebSocket, identidad propia, clasificación, podio, tres CSV y neutralización de fórmulas en el nombre.
- `npm run test:live`: 10/10, incluidos los dos subcasos de nombres, en 21,66 s. Incluye 120 participantes con nombres y recuperación conservando ambos nombres.
- `npm test`: 8/8. `npm run build` y `npx wrangler deploy --config wrangler.production.jsonc --dry-run`: correctos; Worker de 61,93 KiB, 15,09 KiB comprimidos.
- Se comparó la sala local anterior `300274` antes y después de agregar las columnas: mantiene sus 1185 puntos y todos los campos anteriores; las únicas adiciones públicas son `nameMode=alias` y `displayName` igual al alias. Su CSV agrega el nombre elegido vacío. Evidencias: `artifacts/names-migration-before.json` y `artifacts/names-migration-after.json`.
- Navegador local a 390 píxeles: ingreso como **Luna de prueba**, identidad visible durante lectura y respuesta, recarga conservando nombre y 1185 puntos, y podio con el nombre elegido. No se mostró el identificador al grupo.
- Segunda ronda local con nombres en clave: **Luna de prueba** recibió **Búho Cielo**, que se mostró en la espera, durante lectura y en el podio. Sin desbordamiento horizontal a 390 píxeles. Capturas locales: `artifacts/screenshots/nombres-configuracion.png`, `nombres-podio-390.png` y `nombres-clave-podio-390.png`.
- El ensayo remoto de 40 minutos registrado antes de esta ampliación no se repitió. El simulador se adaptó al nuevo campo obligatorio, pero no se generó otra carga en la cuenta con el cupo agotado. La aceptación remota de este cambio sigue pendiente del restablecimiento del servicio.

El cambio se desplegó con `npx wrangler deploy --config wrangler.production.jsonc` como Worker `ea905ddd-c79d-4304-9406-cb9bf4fa8fa8`. A las 22:03 UTC del 26/09, `/health` confirmó esa versión y los tres archivos modificados del panel coincidieron con la construcción local. El catálogo autenticado siguió devolviendo `503 STORAGE_QUOTA`; por tanto, todavía no se comprobó este recorrido contra los datos de producción. Evidencia local: `artifacts/names-deployment.json`. La contraseña solicitada permanece como secreto del servidor y no aparece en los archivos versionados.

Validación humana de esta opción, pendiente:

1. ¿Encontrás y comprendés el selector de nombres antes de crear una ronda?
2. ¿El aviso al ingresar explica cuándo el nombre elegido puede verlo el grupo?
3. ¿La lista, la identidad durante el juego y el podio usan el modo que seleccionaste?
4. ¿Podés relacionar nombre elegido, nombre en clave e identificador en los tres CSV?
5. ¿La recuperación conserva los dos nombres y el puntaje sin pedir que se cambien?

### Recorridos previos

Se comprobaron anchos efectivos de 390, 768, 1280 y 1920 píxeles. La entrada, lectura y respuesta móviles, el editor y la proyección no presentaron desbordamiento horizontal. La vista previa local con 800 caracteres de pregunta y 2000 de explicación empieza arriba, permite desplazamiento y se cierra con Escape. La navegación entre pantallas vuelve al inicio.

La importación publicada rechazó una fila sin explicación e indicó `Fila 2, F`; no habilitó un guardado parcial. Después se importó y publicó la plantilla válida como **Ejemplo — primeras tres preguntas**, disponible para comenzar. En la prueba local de recuperación, la revocación cerró el acceso anterior y el botón **Recuperar mi acceso** permitió regresar al mismo personaje y puntaje con el código de un solo uso.

El CSV se verificó desde la API publicada: contenido, BOM UTF-8 y rechazo 401 sin contraseña. El navegador integrado no notificó la descarga al pulsar el botón; esa comprobación en Chrome o Edge queda pendiente de confirmación humana. No se presenta como aprobada por la comprobación de la API. Las capturas y los informes completos se conservan localmente en `artifacts/`, fuera del repositorio público.

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
