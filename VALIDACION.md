# Construcción y comprobaciones — 26 de septiembre de 2026

## Alcance y fuentes

El pedido autorizado fue construir un proyecto nuevo, publicarlo en GitHub Pages y presentar alternativas visuales. El usuario confirmó la cuenta `fncolque`, los nombres `quiz-en-vivo` / `ronda-quiz-en-vivo`, el producto Ronda y la propuesta **A · Estudio**.

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
| `npm test` | 7/7: límites, puntajes, identidades, empates, CSV y lectura/errores de Excel. |
| `npm run test:live` | 7/7 contra SQLite real en workerd, 11,3 s en la última ejecución previa al despliegue. |
| `npm run build` | Genera dos salidas independientes; la galería queda excluida de Pages. |
| `npx wrangler deploy --config wrangler.production.jsonc --dry-run --outdir artifacts/worker-dry-run` | Correcto: bindings independientes, 58,83 KiB de Worker antes de compresión, 20 archivos de panel. |
| Navegador local | Importación real del XLSX, revisión de tres preguntas, publicación, creación de sala, lectura, respuesta, cierre, recarga del participante, finalización y proyección pública. |
| `npm run test:load` contra el Worker publicado | En ejecución; se registrará el informe final antes de marcar esta comprobación como aprobada. |

La integración comprueba 120 ingresos simultáneos, rechazo del 121, respuesta persistida antes de confirmarla, duplicado idéntico admitido y cambio rechazado, cierre por última respuesta y plazo, privacidad antes del cierre, conflicto de edición, versiones inmutables, restauración sin sobrescribir, revocación HTTP y WebSocket al recuperar identidad, y recorrido de 50 preguntas con texto máximo. Los CSV distinguen omisiones y preguntas no presentadas.

La construcción siguió incrementos de extremo a extremo. Primero falló el acceso al catálogo por ausencia del endpoint (404 en lugar de 401), después pasó con autorización real. El recorrido de sala falló inicialmente en la creación del cuestionario y pasó tras implementar persistencia. La recuperación se corrigió a partir de una prueba que comprobaba el cierre efectivo del socket anterior. Las comprobaciones no se sustituyeron por mocks de respuestas.

## Límites y verificaciones pendientes

- La prueba de carga representa 120 clientes HTTP/WebSocket, un facilitador y una proyección; no equivale a 120 navegadores ni dispositivos físicos. Los preflight se representan al inicio y cada cuatro preguntas y los heartbeats cada 25 s. La red móvil y la suspensión real de teléfonos requieren ensayo humano.
- La expiración de 24 horas está implementada con alarma y verificación en cada acceso, pero no se afirma haber esperado un día completo. Los límites de tiempo y el vencimiento corto sí tienen pruebas; el instante exacto se comprueba en las reglas, no con un reloj distribuido controlado.
- La integración usa persistencia SQLite real. Falta un ensayo dedicado de evicción forzada y recuperación tras caída del proceso durante una escritura. La prueba remota observa hibernación y reconexiones normales, sin afirmar una caída física del proveedor.
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
