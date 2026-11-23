import { describe, expect, it } from "vitest";
import { passesPolicyPassword } from "./password";

describe("Satzungspasswort", () => {
  it("lässt offen, wenn keins gesetzt ist", () => {
    expect(passesPolicyPassword(undefined, undefined)).toBe(true);
    expect(passesPolicyPassword("", "irgendwas")).toBe(true);
  });

  it("verlangt das genaue Wort", () => {
    expect(passesPolicyPassword("nur-der-vorstand", "nur-der-vorstand")).toBe(true);
    expect(passesPolicyPassword("nur-der-vorstand", "Nur-der-Vorstand")).toBe(false);
    expect(passesPolicyPassword("nur-der-vorstand", "nur-der-vorstand ")).toBe(false);
    expect(passesPolicyPassword("nur-der-vorstand", undefined)).toBe(false);
  });
});