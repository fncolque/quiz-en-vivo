# Ronda

Cuestionarios en vivo para pensar en compañía. Un catálogo compartido permite crear o importar preguntas, publicar versiones y conducir sesiones de hasta 120 participantes.

- Sitio público: https://fncolque.github.io/quiz-en-vivo/
- Creación y conducción: https://ronda-quiz-en-vivo.n-lisis-de--atos.workers.dev/
- Repositorio: https://github.com/fncolque/quiz-en-vivo
- Estado de las comprobaciones y límites: [VALIDACION.md](VALIDACION.md).

## Conducir una ronda

1. Entrá a **Crear y conducir** con la contraseña de creadores. Quienes tienen esa contraseña comparten el catálogo y pueden descargar resultados identificados.
2. Creá un cuestionario o importá la plantilla Excel. La importación ocurre en tu navegador; revisar y confirmar crea un borrador nuevo.
3. Guardá, revisá la vista previa y pulsá **Publicar versión**. Editar después el borrador no modifica una versión ni una sesión existente.
4. Elegí la versión y los tiempos; cada pregunta admite entre 1 y 600 segundos. El valor inicial es 15 segundos. Creá la sala y compartí su enlace o código.
5. Iniciá la lectura. Las opciones y el reloj aparecen al pulsar **Mostrar opciones**. La pregunta cierra cuando responde todo el grupo o vence el plazo del servidor. El avance es manual.
6. Finalizá y descargá clasificación, podio o detalle. Los resultados vencen a las 24 horas de finalizar; una sala sin finalizar vence a las 24 horas de su creación.

El identificador de cada participante se trata como texto, incluidos ceros iniciales. La pantalla del grupo muestra personajes y alias. El mismo navegador conserva la credencial de regreso; si se pierde, quien conduce puede generar una recuperación de un solo uso, válida diez minutos. Esto revoca el acceso anterior.

Las respuestas correctas reciben 1000 puntos más un bono de hasta 250 proporcional al tiempo restante de **esa pregunta**. Un error o una omisión suma cero. Los empates comparten puesto: 1, 1, 3. El servidor confirma una respuesta después de persistirla; se puede reintentar la misma respuesta, pero no cambiarla.

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

## Carga y operación

`npm run test:load` exige `TEST_BASE_URL` (origen del Worker), `TEST_MASTER_SECRET` y `PUBLIC_BASE_URL` en el entorno. Crea una sala sintética con 120 participantes y 15 preguntas, mantiene conexiones durante al menos 40 minutos, representa preflight y heartbeat, provoca reconexiones, duplica respuestas y concilia CSV con el estado final. Archiva su cuestionario al terminar correctamente y deja los resultados vencer normalmente. Guarda el informe en `artifacts/`; nunca lo presenta como una prueba de 120 teléfonos reales.

Antes de una actividad revisá en Cloudflare el uso diario de **toda la cuenta**, incluido el proyecto anterior: solicitudes, duración, lecturas, escrituras y almacenamiento. No hay un indicador automático de cupo disponible en esta aplicación. Las métricas pueden aparecer con demora. Los valores históricos del kit no prueban el consumo de esta instalación. Consultá los [límites y precios de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/); no se activó un plan pago para este proyecto.

La contraseña es común a los creadores: no hay cuentas individuales, permisos por cuestionario ni recuperación por correo. Quien la recibe obtiene acceso al catálogo y los resultados identificados. Distribuí la contraseña solo a quienes deban conducir sesiones; los participantes usan únicamente el enlace o código.
