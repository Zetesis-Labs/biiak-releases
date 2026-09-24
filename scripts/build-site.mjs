import { readFile, mkdir, cp, writeFile } from "node:fs/promises";

export const repository = "Zetesis-Labs/biiak-releases";
const repositoryUrl = `https://github.com/${repository}`;
const versionPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-alpha\.([1-9]\d*))?$/;

function versionParts(tag) {
  const match = typeof tag === "string" && tag.match(versionPattern);
  if (!match) return null;
  return [
    BigInt(match[1]),
    BigInt(match[2]),
    BigInt(match[3]),
    match[4] ? BigInt(match[4]) : null,
  ];
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) throw new Error("Versión no admitida");
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  if (a[3] === b[3]) return 0;
  if (a[3] === null) return 1;
  if (b[3] === null) return -1;
  return a[3] > b[3] ? 1 : -1;
}

function normalizeRelease(release) {
  const parts = versionParts(release.tag_name);
  if (release.draft || !parts) return null;
  const alpha = parts[3] !== null;
  if (release.draft !== false || release.prerelease !== alpha)
    throw new Error("Estado de release incoherente");
  const version = release.tag_name.slice(1);
  const filename = `Biiak_${version}_x64-setup.exe`;
  const base = `${repositoryUrl}/releases/download/${release.tag_name}/`;
  const files = [
    filename,
    `${filename}.sig`,
    "latest.json",
    "SHA256SUMS",
    "distribution.json",
  ];
  for (const name of files) {
    const matches =
      release.assets?.filter((asset) => asset.name === name) ?? [];
    if (
      matches.length !== 1 ||
      matches[0].browser_download_url !== base + name ||
      !Number.isSafeInteger(matches[0].size) ||
      matches[0].size <= 0 ||
      matches[0].state !== "uploaded"
    ) {
      throw new Error(
        `Distribución incompleta o URL inesperada: ${release.tag_name}`,
      );
    }
  }
  if (
    typeof release.published_at !== "string" ||
    !Number.isFinite(Date.parse(release.published_at))
  ) {
    throw new Error("Fecha de publicación inválida");
  }
  return {
    tag: release.tag_name,
    version,
    alpha,
    download: base + filename,
    size: release.assets.find((asset) => asset.name === filename).size,
    date: new Date(release.published_at).toISOString().slice(0, 10),
    url: `${repositoryUrl}/releases/tag/${release.tag_name}`,
    checksums: base + "SHA256SUMS",
  };
}

export function selectReleases(releases, channel) {
  if (!Array.isArray(releases))
    throw new Error("Respuesta de releases inválida");
  if (
    !channel ||
    typeof channel.version !== "string" ||
    !versionParts(`v${channel.version}`)
  )
    throw new Error("Canal inválido");
  const published = releases.map(normalizeRelease).filter(Boolean);
  if (
    new Set(published.map((release) => release.tag)).size !== published.length
  )
    throw new Error("Release duplicada");
  const current = published.find(
    (release) => release.version === channel.version,
  );
  if (
    !current ||
    channel.platforms?.["windows-x86_64"]?.url !== current.download ||
    typeof channel.platforms?.["windows-x86_64"]?.signature !== "string" ||
    !channel.platforms["windows-x86_64"].signature.trim()
  ) {
    throw new Error("El canal no corresponde a una distribución publicada");
  }
  const available = published
    .filter(
      (release) =>
        !release.alpha || compareVersions(release.tag, current.tag) <= 0,
    )
    .sort((a, b) => compareVersions(b.tag, a.tag));
  const featured = available.find((release) => !release.alpha) ?? current;
  return { featured, history: available.slice(0, 4) };
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function dateLabel(date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

function badge(release) {
  return `<span class="badge${release.alpha ? "" : " stable"}">${release.alpha ? "Alpha · Pruebas" : "Estable"}</span>`;
}

export function renderPage(template, selection) {
  const release = selection.featured;
  const values = {
    BADGE: badge(release),
    VERSION: escapeHtml(release.version),
    SIZE: `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(release.size / 1_000_000)} MB`,
    DOWNLOAD: escapeHtml(release.download),
    DATE: escapeHtml(dateLabel(release.date)),
    RELEASE: escapeHtml(release.url),
    CHECKSUMS: escapeHtml(release.checksums),
    NOTICE: release.alpha
      ? '<p class="notice"><strong>Estamos en fase de pruebas.</strong>Utiliza únicamente datos sintéticos. Esta versión no está preparada para uso en producción.</p>'
      : '<p class="notice stable"><strong>Versión estable.</strong>Antes de actualizar, guarda tu trabajo y consulta las notas de esta versión.</p>',
    HISTORY: selection.history
      .map(
        (item) =>
          `<article class="release-row"><span class="release-name">Biiak ${escapeHtml(item.version)}</span>${badge(item)}<time datetime="${escapeHtml(item.date)}">${escapeHtml(dateLabel(item.date))}</time><a class="text-link" href="${escapeHtml(item.url)}">Notas de versión <span aria-hidden="true">↗</span></a></article>`,
      )
      .join("\n"),
  };
  const html = template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Marcador desconocido: ${key}`);
    return values[key];
  });
  if (html.includes("{{")) throw new Error("Plantilla incompleta");
  return html;
}

export async function fetchReleases(
  request = fetch,
  token = process.env.GITHUB_TOKEN,
) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const response = await request(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      },
    );
    if (!response.ok)
      throw new Error(
        `No se pudieron consultar las releases (HTTP ${response.status})`,
      );
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("Respuesta de GitHub inválida");
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error("Se superó el límite de paginación");
}

if (import.meta.main) {
  const releases = await fetchReleases();
  const channel = JSON.parse(
    await readFile(new URL("../channels/alpha.json", import.meta.url), "utf8"),
  );
  const template = await readFile(
    new URL("../site/index.html", import.meta.url),
    "utf8",
  );
  const selection = selectReleases(releases, channel);
  const html = renderPage(template, selection);
  const output = new URL("../_site/", import.meta.url);
  await mkdir(output, { recursive: true });
  await cp(
    new URL("../site/assets/", import.meta.url),
    new URL("assets/", output),
    { recursive: true },
  );
  await cp(
    new URL("../site/styles.css", import.meta.url),
    new URL("styles.css", output),
  );
  await writeFile(new URL("index.html", output), html);
  process.stdout.write(
    `Página generada: Biiak ${selection.featured.version}; ${selection.history.length} versiones públicas.\n`,
  );
}
