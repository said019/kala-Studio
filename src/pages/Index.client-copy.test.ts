import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, "Index.tsx"), "utf8");

describe("Kala landing client copy", () => {
  it("includes the client-requested landing copy", () => {
    expect(indexSource).toContain("Fuerza");
    expect(indexSource).toContain("Equilibrio");
    expect(indexSource).toContain("Flexibilidad");
    expect(indexSource).toMatch(/Evoluciona[\s\S]*en cada clase\./);
    expect(indexSource).toContain("Playlists y rutinas nuevas cada día.");
    expect(indexSource).toContain("Cupos de 5 alumnas por clase.");
    expect(indexSource).toMatch(/Aquí crecemos[\s\S]*juntas\./);
    expect(indexSource).toContain("Barre es para todas, sin condiciones.");
  });

  it("removes copy the client asked to take out", () => {
    expect(indexSource).not.toContain("No configures tu meta");
    expect(indexSource).not.toContain("gánala.");
    expect(indexSource).not.toContain("Karla decide la recompensa por plan");
  });

  it("explains the recorded classes benefit for selected packages", () => {
    expect(indexSource).toContain("Clases grabadas");
    expect(indexSource).toContain("Algunos paquetes");
    expect(indexSource).toContain("Los planes seleccionados pueden incluir acceso a la biblioteca de videos");
    expect(indexSource).toContain("Acceso según plan");
  });
});
