import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "BookClasses.tsx"), "utf8");

describe("BookClasses calendar redesign", () => {
  it("includes the redesigned student booking experience", () => {
    expect(source).toContain("Tu agenda Kala");
    expect(source).toContain("Vista semanal");
    expect(source).toContain("Lista móvil");
    expect(source).toContain("Próxima disponible");
    expect(source).toContain("lugares libres");
    expect(source).toContain("Reservar clase");
  });
});
