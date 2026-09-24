import { describe, test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  compareVersions,
  selectReleases,
  renderPage,
  fetchReleases,
  repository,
  escapeHtml,
} from "../scripts/build-site.mjs";

function release(version, overrides = {}) {
  const base = `https://github.com/${repository}/releases/download/v${version}/`;
  const filename = `Biiak_${version}_x64-setup.exe`;
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: version.includes("-alpha."),
    published_at: "2026-09-24T13:14:51Z",
    assets: [
      filename,
      `${filename}.sig`,
      "latest.json",
      "SHA256SUMS",
      "distribution.json",
    ].map((name) => ({
      name,
      browser_download_url: base + name,
      size: 43_649_026,
      state: "uploaded",
    })),
    ...overrides,
  };
}
function channel(item) {
  return {
    version: item.tag_name.slice(1),
    platforms: {
      "windows-x86_64": {
        url: item.assets[0].browser_download_url,
        signature: "firma-sintética",
      },
    },
  };
}
const alpha3 = release("0.1.0-alpha.3");
const alpha5 = release("0.1.0-alpha.5");

describe("Descarga pública de Biiak", () => {
  test("destaca la alpha del canal, sin depender del orden o fecha de la API", () => {
    const result = selectReleases([alpha3, alpha5], channel(alpha5));
    expect(result.featured.version).toBe("0.1.0-alpha.5");
    expect(result.history.map((item) => item.version)).toEqual([
      "0.1.0-alpha.5",
      "0.1.0-alpha.3",
    ]);
  });
  test("no anuncia una alpha que todavía no se ha incorporado al canal", () => {
    const result = selectReleases(
      [release("0.1.0-alpha.6"), alpha5],
      channel(alpha5),
    );
    expect(result.featured.version).toBe("0.1.0-alpha.5");
    expect(result.history).toHaveLength(1);
  });
  test("da prioridad a estable y mantiene una alpha posterior identificada en el historial", () => {
    const future = release("0.2.0-alpha.1");
    const result = selectReleases(
      [future, release("0.1.0"), alpha5],
      channel(future),
    );
    expect(result.featured.version).toBe("0.1.0");
    expect(result.history[0].alpha).toBe(true);
  });
  test("acepta el paso automático del canal alpha a una versión estable", () => {
    const stable = release("0.1.0");
    expect(
      selectReleases([alpha5, stable], channel(stable)).featured.alpha,
    ).toBe(false);
  });
  test("ordena versiones numéricamente y estable después de alpha", () => {
    expect(compareVersions("v0.1.0-alpha.10", "v0.1.0-alpha.9")).toBe(1);
    expect(compareVersions("v0.1.0", "v0.1.0-alpha.10")).toBe(1);
    expect(compareVersions("v1.0.0", "v0.99.0")).toBe(1);
  });
  test("excluye borradores y tags no soportados", () => {
    const result = selectReleases(
      [alpha5, release("9.0.0", { draft: true }), release("1.0.0-rc.1")],
      channel(alpha5),
    );
    expect(result.history).toHaveLength(1);
  });
  test("rechaza prerelease incoherente, canal inexistente y duplicados", () => {
    expect(() =>
      selectReleases(
        [release("0.1.0-alpha.5", { prerelease: false })],
        channel(alpha5),
      ),
    ).toThrow();
    expect(() => selectReleases([alpha3], channel(alpha5))).toThrow();
    expect(() => selectReleases([alpha5, alpha5], channel(alpha5))).toThrow();
    expect(() => selectReleases([alpha5], {})).toThrow();
  });
  test("rechaza distribuciones incompletas o assets que no han terminado de subir", () => {
    expect(() =>
      selectReleases(
        [{ ...alpha5, assets: alpha5.assets.slice(0, 2) }],
        channel(alpha5),
      ),
    ).toThrow();
    const incomplete = structuredClone(alpha5);
    incomplete.assets[0].state = "new";
    expect(() => selectReleases([incomplete], channel(alpha5))).toThrow();
  });
  test("rechaza URLs de otro origen, otro repositorio y manifiestos que no corresponden", () => {
    for (const url of [
      "https://example.com/install.exe",
      "javascript:alert(1)",
      "https://github.com/otro/repo/releases/download/v0.1.0-alpha.5/Biiak_0.1.0-alpha.5_x64-setup.exe",
    ]) {
      const altered = structuredClone(alpha5);
      altered.assets[0].browser_download_url = url;
      expect(() => selectReleases([altered], channel(altered))).toThrow();
    }
    expect(() =>
      selectReleases([alpha5], { ...channel(alpha5), platforms: {} }),
    ).toThrow();
  });
  test("rechaza fechas y tamaños inválidos", () => {
    expect(() =>
      selectReleases(
        [{ ...alpha5, published_at: "incorrecto" }],
        channel(alpha5),
      ),
    ).toThrow();
    const invalid = structuredClone(alpha5);
    invalid.assets[0].size = 0;
    expect(() => selectReleases([invalid], channel(alpha5))).toThrow();
  });
  test("genera enlaces exactos y advertencia alpha sin scripts, seguimiento ni dependencia del navegador", async () => {
    const template = await readFile(
      new URL("../site/index.html", import.meta.url),
      "utf8",
    );
    const html = renderPage(
      template,
      selectReleases([alpha3, alpha5], channel(alpha5)),
    );
    expect(html).toContain(`href="${alpha5.assets[0].browser_download_url}"`);
    expect(html).toContain("43,6 MB");
    expect(html).toContain("Utiliza únicamente datos sintéticos");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("biiak-next");
    expect(html).not.toContain("firma-sintética");
    const stable = release("0.1.0");
    const stableHtml = renderPage(
      template,
      selectReleases([stable], channel(stable)),
    );
    expect(stableHtml).toContain("<strong>Versión estable.</strong>");
    expect(stableHtml).not.toContain("Estamos en fase de pruebas.");
  });
  test("escapa HTML y falla ante marcadores desconocidos", () => {
    expect(escapeHtml("<\"&'>")).toBe("&lt;&quot;&amp;&#39;&gt;");
    expect(() =>
      renderPage("{{UNKNOWN}}", selectReleases([alpha5], channel(alpha5))),
    ).toThrow();
  });
  test("consulta todas las páginas de releases sin filtrar el token a los resultados", async () => {
    const calls = [];
    const result = await fetchReleases(async (url, options) => {
      calls.push(url);
      expect(options.redirect).toBe("error");
      return Response.json(
        calls.length === 1 ? Array(100).fill(alpha3) : [alpha5],
      );
    }, "token-sintético");
    expect(result).toHaveLength(101);
    expect(calls[1]).toEndWith("page=2");
  });
  test("un error de API impide publicar una página con una descarga inventada", async () => {
    await expect(
      fetchReleases(async () => new Response(null, { status: 403 }), ""),
    ).rejects.toThrow("HTTP 403");
    await expect(
      fetchReleases(async () => Response.json({ message: "error" }), ""),
    ).rejects.toThrow();
  });
});
