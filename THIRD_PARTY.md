# Componentes de terceros

- **SheetJS Community Edition 0.20.3**: distribución oficial `https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs`, descargada para lectura local de Excel. SHA-256: `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`. Licencia Apache 2.0 en `admin/vendor/SHEETJS-LICENSE.txt`. Se sirve únicamente en el panel de creadores.
- **Bricolage Grotesque**, **Source Sans 3**, **Archivo Black** y **DM Serif Display**: subconjuntos latinos WOFF2 de Google Fonts, alojados localmente. Licencias SIL OFL en `design/fonts/*-OFL.txt`. Estudio usa las dos primeras; las restantes pertenecen a las propuestas visuales.
- Wrangler y ws: versiones exactas y dependencias en `package-lock.json`, usadas para desarrollo, despliegue y pruebas; no se sirven en el navegador.

Las páginas no necesitan servicios de tipografía ni scripts externos para funcionar.
