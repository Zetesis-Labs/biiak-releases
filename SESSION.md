# Sesión: página pública de descargas de Biiak — actualizado 2026-09-24 20:07

## Objetivo

Página corporativa de GitHub Pages con descarga de la versión disponible de
Biiak, sin publicar el código de la aplicación. Entregada y verificada.

## Estado actual

- Implementación publicada en main: af9fb5071ecc6ff93616345fd60238fd081cdf21.
- Workflow 36038919318: build y deploy correctos; dirección pública devuelve 200.
- Página muestra alpha.5, 43,6 MB, aviso exclusivo para datos sintéticos y dos
  versiones públicas (alpha.5 y alpha.3). No se creó ninguna release de la app.
- 14 tests, 40 aserciones; formato Prettier 3.6.2 correcto.
- Playwright Chromium sobre copia local y URL pública: 1440, 390 y 320 px,
  sin JavaScript, sin desbordamientos, FAQ con ratón/teclado, sin errores de carga.
- La navegación de descarga se comprobó con respuesta interceptada sintética,
  sin ejecutar binarios. HEAD real sigue redirección y devuelve 200,
  filename esperado y content-length 43649026.
- Logotipo, color y tipografía existentes de Biiak; fuente local con licencia.

## Decisiones y porqués

- GitHub Pages en dominio github.io: no necesita dominio propio ni servicios nuevos.
- Sólo HTML/CSS para visitantes: evita depender de API, tokens o JavaScript al descargar.
- Build con Bun sin dependencias npm: metadatos públicos consultados en CI.
- Estable prioritaria si existe; de lo contrario alpha señalada por el canal.
- Push del canal, eventos de release y workflow_dispatch regeneran la página.
- Errores de API o distribución incompleta impiden sustituir la web vigente.
- No alterar instaladores, canal ni pipeline privado para crear la página.
- Firma del actualizador distinta de Authenticode: el texto no promete quitar SmartScreen.

## Hipótesis descartadas

- No basta usar releases/latest: no incluye la alpha que se distribuye actualmente.
- No es necesario publicar una nueva alpha para publicar esta web.

## Pendientes

- Ninguno para esta entrega. Ajustes de contenido/diseño según revisión del usuario.
- El paso real futuro alpha→estable se ha probado con fixtures, no se ha publicado
  una estable para probar la página. La publicación actual utiliza datos reales de alpha.5.

## Gotchas descubiertos

- GitHub Pages build_type=workflow; entorno github-pages permite rama main y tags
  v* para que los eventos de release puedan desplegar. No habilitar PRs no confiables.
- Ubuntu alojado de GitHub funciona para este repositorio público; no usar runners
  Windows ni self-hosted para construir la página.
- GITHUB_TOKEN sólo de lectura en build; Pages e id-token sólo en deploy.
- Únicamente se publica _site/, nunca la raíz del checkout ni archivos internos.
- Biiak continúa siendo aplicación privada aunque el código de su web sea público.
- Desarrollo comprobado dentro de biiak-next-dev en copia ignorada
  /workspace/.scratch/biiak-release-site; no ejecutar build/lint en el host.
- Harness visual local ignorado: .scratch/check-site.mjs; usa Playwright del
  contenedor existente. SITE_URL permite validar la URL pública. No es test de CI.

## Referencias

- https://zetesis-labs.github.io/biiak-releases/
- https://github.com/Zetesis-Labs/biiak-releases/actions/runs/36038919318
- .github/workflows/pages.yml
- scripts/build-site.mjs
- tests/site.test.mjs
- site/index.html
- site/styles.css
- README.md
