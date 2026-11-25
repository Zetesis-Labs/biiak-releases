# Biiak

Repositorio público de distribución de Biiak.

Instaladores, firmas del actualizador, manifiestos, hashes y página de descargas.
El código fuente de la aplicación se mantiene privado. Este repositorio contiene
únicamente la distribución, su validación externa y el código de su página pública.

[Descargar Biiak](https://zetesis-labs.github.io/biiak-releases/) ·
[Historial de versiones](https://github.com/Zetesis-Labs/biiak-releases/releases)

Las alphas son versiones de prueba exclusivamente para datos sintéticos.
Las versiones que incluyen macOS ofrecen DMG y ZIP para Apple Silicon, con
instalación manual y sus propias sumas SHA-256. No incluyen notarización Apple.
La firma del actualizador no equivale a una firma Authenticode reconocida por
Windows. Consulta las notas de cada release antes de instalar.

## Aceptación Windows

`windows-acceptance.yml` prueba un borrador `candidate-windows-v…` en tres
máquinas Windows desechables: instalación cifrada, instalación sin cifrar y
actualización desde alpha.20. Comprueba los hashes, versión, servicio, conservación
de un acta sintética y de la clave de custodia, arranque del motor de texto CPU y
desinstalación. Los recibos identifican el commit y SHA-256 del instalador.
No recibe código fuente ni secretos del repositorio privado. El token de descarga
no se entrega al paso que ejecuta el instalador. La VM se destruye al terminar.

Esta aceptación no publica ni avanza el canal. El proceso privado verifica también
la firma del actualizador y sólo publica los mismos bytes tras revisar los recibos.
No acredita Authenticode, Smart App Control, GPU, micrófonos físicos ni el recorrido
de descarga del actualizador integrado; esos controles son independientes.

## Página de descargas

Sitio estático, sin JavaScript de navegador, analítica, cookies ni fuentes externas.
Reutiliza el logotipo, el verde corporativo y Plus Jakarta Sans de Biiak. La
licencia de la tipografía se conserva en `site/assets/Jakarta-LICENSE.txt`.

El workflow `pages.yml` genera y publica la página al cambiar `main` (incluido
`channels/alpha.json`), al publicar o modificar una release y bajo petición manual.
Los ejecutables siguen descargándose desde GitHub Releases; no se copian a Pages.
GitHub Pages debe estar configurado con GitHub Actions como fuente de despliegue.
El entorno `github-pages` permite la rama `main` y los tags `v*` para los eventos
de release; no se ejecuta código de pull requests en este workflow.

- La descarga principal es la estable de mayor versión, si existe.
- Si sólo hay alphas, se utiliza la versión publicada que señala el canal alpha.
- Una alpha aún no incorporada al canal no se anuncia. El historial permite
  consultar alphas posteriores cuando ya existe una estable.
- Sólo se admiten tags `vX.Y.Z` y `vX.Y.Z-alpha.N`, releases públicas completas
  y URLs exactas de este repositorio. Se ordenan por versión, no por fecha.
- La descarga macOS sólo aparece cuando están publicados el DMG, ZIP y los tres
  archivos de metadatos previstos. Una entrega macOS parcial impide desplegar.
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
