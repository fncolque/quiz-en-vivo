# Ronda

Cuestionarios en vivo para pensar en compañía. Un catálogo compartido permite crear o importar preguntas, publicar versiones y conducir sesiones de hasta 120 participantes.

**Estado al 27/09/2026, 00:02 de Argentina:** publicado el ingreso con un único **Nombre o identificador** y la corrección de envíos que quedaban pendientes aunque el servidor ya hubiera guardado la respuesta. Se comprobaron ambos modos de nombres y los CSV en producción, además de dos respuestas desde el navegador con proyección abierta y recarga. La sala reportada `360624` y los resultados anteriores permanecen intactos. El recorrido completo y el QR ya tuvieron las comprobaciones descritas en [VALIDACION.md](VALIDACION.md); falta repetir el ensayo en el teléfono del usuario con esta versión. No hay registros suficientes para atribuir una causa exacta a su respuesta omitida. Estas pruebas pequeñas no miden el cupo restante ni sustituyen el ensayo con la red y los dispositivos de una actividad.

- Sitio público: https://fncolque.github.io/quiz-en-vivo/
- Creación y conducción: https://ronda-quiz-en-vivo.n-lisis-de--atos.workers.dev/
- Repositorio: https://github.com/fncolque/quiz-en-vivo
- Estado de las comprobaciones y límites: [VALIDACION.md](VALIDACION.md).

## Conducir una ronda

1. Entrá a **Crear y conducir** con la contraseña de creadores. Quienes tienen esa contraseña comparten el catálogo y pueden descargar resultados identificados.
2. Creá un cuestionario o importá la plantilla Excel. La importación ocurre en tu navegador; revisar y confirmar crea un borrador nuevo.
3. Guardá, revisá la vista previa y pulsá **Publicar versión**. Editar después el borrador no modifica una versión ni una sesión existente.
4. Elegí la versión, los tiempos y **Mostrar participantes como**: **Nombres aleatorios (anonimizar)** (opción inicial) o **Dato ingresado (nombre o identificador)**. Indicá al grupo qué debe escribir al entrar. La elección queda fija para esa sala. Cada pregunta admite entre 1 y 600 segundos; el valor inicial es 15 segundos. Creá la sala y compartí su enlace o código.
5. Iniciá la lectura. Las opciones y el reloj aparecen al pulsar **Mostrar opciones**. La pregunta cierra cuando responde todo el grupo o vence el plazo del servidor. El avance es manual.
6. Finalizá y descargá clasificación, podio o detalle. Los resultados vencen a las 24 horas de finalizar; una sala sin finalizar vence a las 24 horas de su creación.

Para empezar, el catálogo incluye **Ejemplo — primeras tres preguntas**, publicado como versión 1. Podés duplicarlo para preparar tu propio contenido. Las salas creadas durante la comprobación son sintéticas y sus resultados vencerán normalmente.

En el panel de la sala, **Mostrar QR de esta sala** permite proyectar el código o descargarlo como SVG. El QR y **Copiar enlace de participantes** llevan al mismo destino: el formulario de esa sala, que pide un solo **Nombre o identificador** sin pasar por la portada ni pedir el número de sala. El QR se genera en el navegador y contiene solo el enlace público, sin contraseña ni credenciales. Compartilo antes de iniciar para admitir participantes nuevos; quien ya ingresó puede volver con su acceso. Desde la portada se mantiene el ingreso manual por código.

Al ingresar, cada participante completa un único campo **Nombre o identificador**, siguiendo las instrucciones recibidas para la sala. Admite de 1 a 64 caracteres visibles y se trata como texto, incluidos ceros iniciales. Ese dato debe ser único dentro de la sala; si dos personas comparten nombre, quien conduce debe indicar cómo distinguirlas. Cada persona recibe además un personaje y un nombre aleatorio sin repeticiones dentro de la sala.

La opción de la sala se aplica a la lista de participantes, la identidad durante el juego, el podio y la clasificación. **Dato ingresado** muestra lo que escribió la persona; **Nombres aleatorios** oculta ese dato en los estados públicos y de participantes. Quienes tienen la contraseña de creadores pueden consultar el dato ingresado y el nombre aleatorio y descargarlos en los resultados.

El mismo navegador conserva la credencial de regreso; si se pierde, quien conduce puede generar una recuperación de un solo uso, válida diez minutos. La persona escribe el mismo nombre o identificador y ese código. Esto revoca el acceso anterior y conserva los datos y el puntaje. Las salas anteriores conservan sus identificadores originales para recuperar acceso.

Las respuestas correctas reciben 1000 puntos más un bono de hasta 250 proporcional al tiempo restante de **esa pregunta**. Un error o una omisión suma cero. Los empates comparten puesto: 1, 1, 3. El servidor confirma una respuesta después de persistirla; se puede reintentar la misma respuesta, pero no cambiarla. La confirmación en vivo también libera el envío pendiente, aunque se pierda la respuesta HTTP. Si en cinco segundos no hay confirmación, aparece un aviso y **Reintentar la misma respuesta**; debe llegar antes del cierre. Al pasar a otra pregunta se descarta el envío pendiente anterior, y la devolución indica cuando no quedó una respuesta guardada.

## Desarrollo local

Requisitos: Node.js 24 o posterior y npm. No hace falta iniciar sesión en Cloudflare para trabajar localmente.

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run build
npm run dev:api
```

En otra terminal:

```powershell
npm run dev:public
```

Panel: http://127.0.0.1:8787/ · Entrada: http://127.0.0.1:4173/

La contraseña **ficticia y exclusivamente local** está en `.dev.vars.example`. No sobrescribas un `.dev.vars` existente con credenciales propias. La base local queda en `.wrangler/`, excluida de Git.

```powershell
npm test
npm run test:live
```

`test` comprueba reglas y Excel. `test:live` necesita `dev:api` en ejecución y usa SQLite real de workerd: crea exclusivamente datos sintéticos locales. No ejecutes esta suite contra producción cambiando variables; la prueba remota tiene un comando separado.

La galería de las tres alternativas visuales se abre con `npm run preview:design` en http://127.0.0.1:4174/. **Estudio** fue la alternativa elegida. La galería no se publica en Pages.

## Estructura

| Directorio | Responsabilidad |
| --- | --- |
| `site/` | Entrada, participante y proyección públicas. |
| `admin/` | Acceso, catálogo, editor, importación y conducción. |
| `shared/` | Componentes DOM, estilos, conexión y presentación de la sala. |
| `services/` | Autorización, validación, catálogo y motor persistente. |
| `tests/` | Pruebas de reglas, Excel y recorrido real en workerd. |
| `tools/` | Construcción, servidor local y simulación remota. |
| `design/` | Alternativas de diseño y tipografías locales con sus licencias. |

El Worker `ronda-quiz-en-vivo` tiene dos clases de Durable Objects con SQLite: `QuizCatalog` conserva borradores y versiones; un `QuizRoom` por código conserva el snapshot de una sesión, sus participantes y respuestas. Las transacciones resuelven duplicados y el cierre por la última respuesta. Alarmas del servidor cierran ventanas y vencen salas; cada acceso también verifica el vencimiento. Los WebSockets hibernables distribuyen estado; las acciones entran por HTTP.

No hay una base compartida con el proyecto anterior. No se utiliza D1, R2, un framework frontend ni un servicio de autenticación adicional. Wrangler y `ws` se usan para desarrollo y comprobación. SheetJS CE y las fuentes se sirven localmente: [licencias y versiones](THIRD_PARTY.md).

## Publicar cambios

GitHub Pages publica **solo `dist/public`** al actualizar `main`. El workflow ejecuta `npm ci`, `npm test` y `npm run build`; necesita la variable pública del repositorio `API_BASE_URL` con la URL del Worker más `/api`. Las acciones oficiales están fijadas por commit.

Para publicar el Worker y su panel desde PowerShell:

```powershell
$env:API_BASE_URL='https://ronda-quiz-en-vivo.n-lisis-de--atos.workers.dev/api'
$env:PUBLIC_BASE_URL='https://fncolque.github.io/quiz-en-vivo/'
npm run build
npx wrangler deploy --config wrangler.production.jsonc --dry-run
npx wrangler deploy --config wrangler.production.jsonc
```

Usá `wrangler.production.jsonc` expresamente. El `wrangler.jsonc` predeterminado apunta al entorno local. Publicá código entre sesiones; no modifiques snapshots ni esquemas de datos activos sin una transición compatible con esa instalación.

La contraseña de producción se configura como secreto `MASTER_SECRET`, nunca como variable de Pages ni archivo del repositorio:

```powershell
npx wrangler secret put MASTER_SECRET --config wrangler.production.jsonc
```

Ingresá la contraseña por entrada interactiva, no como argumento del comando. Al rotarla, comprobá que la nueva funciona y la anterior se rechaza. El panel conserva la contraseña solo en memoria y pide ingresar otra vez al recargar. El acceso administrativo usa el propio origen del Worker, con CSP y datos `no-store`.

GitHub Pages aloja las pantallas públicas; el formulario de contraseña vive en Cloudflare. Esta separación también responde a los [límites de uso de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Datos y respaldo

El catálogo no vence. Exportá su JSON desde el panel después de cambios importantes. Contiene preguntas y soluciones: guardalo fuera del repositorio público. La restauración muestra una vista previa, valida hashes y agrega lo que falta; ante conflictos conserva lo existente. Si el catálogo cambia después de revisar, exige una nueva revisión. Actualmente admite respaldos de hasta 16 MiB, 1000 cuestionarios y 1000 versiones por cuestionario; si se llega a ese tamaño, debe planificarse una ampliación antes de confiar en ese archivo para restaurar.

El Excel admite 1–50 preguntas en `Preguntas`, con los seis encabezados exactos de la plantilla. La columna B es la correcta al importar; al jugar, las alternativas reciben posiciones mezcladas. Fórmulas, datos parciales, protección y tipos no admitidos rechazan la importación completa. Los límites son 2 MiB de archivo y cinco segundos de análisis en un Web Worker. No se sube el archivo; solo se guarda el JSON validado tras confirmar.

Los CSV separan `correcta`, `incorrecta`, `sin_respuesta` y `no_presentada`. Incluyen BOM UTF-8, comillas escapadas, CRLF y neutralización de celdas que podrían ejecutarse como fórmulas. Conservá los identificadores como **texto** al importarlos en Excel para no perder ceros iniciales.

Clasificación, podio y respuestas conservan `identificador`, `personaje` (nombre aleatorio) y `nombre_elegido`, sin depender del modo de visualización. Para los ingresos nuevos, `identificador` y `nombre_elegido` contienen el mismo dato del campo único. Los registros anteriores mantienen sus valores originales, incluido un nombre vacío si entonces no se solicitaba; no se reescriben resultados históricos ni cambia el orden de las columnas. Un formulario antiguo que aún envíe dos datos recibe la indicación de recargar, para evitar mostrar como nombre un identificador que su pantalla anunciaba como privado.

## Carga y operación

`npm run test:load` exige `TEST_BASE_URL` (origen del Worker), `TEST_MASTER_SECRET` y `PUBLIC_BASE_URL` en el entorno. Crea una sala sintética con 120 participantes y 15 preguntas, mantiene conexiones durante al menos 40 minutos, representa preflight y heartbeat, provoca reconexiones, duplica respuestas y concilia CSV con el estado final. Archiva su cuestionario al terminar correctamente y deja los resultados vencer normalmente. Guarda el informe en `artifacts/`; nunca lo presenta como una prueba de 120 teléfonos reales.

Antes de una actividad revisá en Cloudflare el uso diario de **toda la cuenta**, incluido el proyecto anterior: solicitudes, duración, lecturas, escrituras y almacenamiento. No hay un indicador automático de cupo disponible en esta aplicación. Las métricas pueden aparecer con demora. Los valores históricos del kit no prueban el consumo de esta instalación. Consultá los [límites y precios de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/); no se activó un plan pago para este proyecto.

La lectura de suscripciones de la cuenta devolvió 403. El runtime confirmó el límite Free al rechazar operaciones con `Exceeded allowed rows read in Durable Objects free tier.` El presupuesto propuesto en el kit debe reemplazarse por la medición de esta instalación registrada en [VALIDACION.md](VALIDACION.md); una prueba funcional exitosa no certifica cupo disponible ni facturación.

La contraseña es común a los creadores: no hay cuentas individuales, permisos por cuestionario ni recuperación por correo. Quien la recibe obtiene acceso al catálogo y los resultados identificados. Distribuí la contraseña solo a quienes deban conducir sesiones; los participantes usan únicamente el enlace o código.
