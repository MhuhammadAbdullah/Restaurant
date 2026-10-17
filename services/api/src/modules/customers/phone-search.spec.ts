import { describe, expect, it } from "vitest";
import { phoneSearchCore } from "./phone-search";

describe("phoneSearchCore", () => {
  it("gives the same core for every way of writing one number", () => {
    for (const written of ["03001234567", "0300 1234567", "0300-1234567", "+92 300 1234567", "+923001234567", "923001234567", "0092 300 1234567", "(0300) 123 4567"]) {
      expect(phoneSearchCore(written)).toBe("3001234567");
    }
  });

  it("works while the number is still being typed", () => {
    expect(phoneSearchCore("0300")).toBe("300");
    expect(phoneSearchCore("03001")).toBe("3001");
    expect(phoneSearchCore("+92300")).toBe("300");
  });

  it("refuses to search on too few digits or on words", () => {
    expect(phoneSearchCore("")).toBe("");
    expect(phoneSearchCore("030")).toBe("");
    expect(phoneSearchCore("ali")).toBe("");
  });

  it("does not drop a leading 92 that is part of a short local number", () => {
    expect(phoneSearchCore("9212")).toBe("9212");
  });
});
