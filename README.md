# Biiak

Repositorio público de distribución de Biiak.

Instaladores, firmas del actualizador, manifiestos, hashes y página de descargas.
El código fuente de la aplicación se mantiene privado. Este repositorio contiene
únicamente la distribución y el código de su página pública.

[Descargar Biiak](https://zetesis-labs.github.io/biiak-releases/) ·
[Historial de versiones](https://github.com/Zetesis-Labs/biiak-releases/releases)

Las alphas son versiones de prueba exclusivamente para datos sintéticos.
La firma del actualizador no equivale a una firma Authenticode reconocida por
Windows. Consulta las notas de cada release antes de instalar.

## Página de descargas

Sitio estático, sin JavaScript de navegador, analítica, cookies ni fuentes externas.
Reutiliza el logotipo, el verde corporativo y Plus Jakarta Sans de Biiak. La
licencia de la tipografía se conserva en `site/assets/Jakarta-LICENSE.txt`.

El workflow `pages.yml` genera y publica la página al cambiar `main` (incluido
`channels/alpha.json`), al publicar o modificar una release y bajo petición manual.
Los ejecutables siguen descargándose desde GitHub Releases; no se copian a Pages.
GitHub Pages debe estar configurado con GitHub Actions como fuente de despliegue.

- La descarga principal es la estable de mayor versión, si existe.
- Si sólo hay alphas, se utiliza la versión publicada que señala el canal alpha.
- Una alpha aún no incorporada al canal no se anuncia. El historial permite
  consultar alphas posteriores cuando ya existe una estable.
- Sólo se admiten tags `vX.Y.Z` y `vX.Y.Z-alpha.N`, releases públicas completas
  y URLs exactas de este repositorio. Se ordenan por versión, no por fecha.
- Un fallo de API, assets incompletos o un canal incoherente hace fallar el
  despliegue: la web anterior permanece publicada. Los visitantes no consumen
  la API ni necesitan cuenta o token de GitHub.
- La web muestra la distribución que ya ha pasado la cadena de publicación;
  no vuelve a verificar criptográficamente los binarios ni ejecuta el instalador.

## Desarrollo

Ejecutar en contenedor con Bun 1.4.2, no desde el host. Sin dependencias npm:

```sh
bun test
bun scripts/build-site.mjs
```

El build consulta la API pública y escribe únicamente `_site/`, que es el único
directorio desplegado. Puede recibir `GITHUB_TOKEN` de sólo lectura en CI para
evitar límites de consulta; nunca se incluye en el HTML. En local necesita el
canal `channels/alpha.json` actualizado. Para inspección visual, servir `_site/`
con cualquier servidor estático dentro del contenedor.
