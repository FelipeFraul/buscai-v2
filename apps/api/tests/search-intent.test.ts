import { describe, expect, it } from "vitest";

import { parseSearchIntent } from "../src/modules/search/search-intent";

const cities = [{ id: "city-1", name: "Itapetininga", state: "SP" }];

describe("parseSearchIntent", () => {
  it("handles simple query", () => {
    const intent = parseSearchIntent({ cityId: "city-1", nicheId: "n1", query: "dentista", cities });
    expect(intent.normalizedText).toBe("dentista");
    expect(intent.flags.nearMe).toBe(false);
    expect(intent.flags.hasCityInText).toBe(false);
  });

  it("detects city mention", () => {
    const intent = parseSearchIntent({
      cityId: "city-1",
      nicheId: "n1",
      query: "dentista em Itapetininga",
      cities,
    });
    expect(intent.flags.hasCityInText).toBe(true);
    expect(intent.inferredCityId).toBe("city-1");
    expect(intent.normalizedText).toContain("dentista");
  });

  it("detects near me patterns", () => {
    const intent = parseSearchIntent({
      cityId: "city-1",
      nicheId: "n1",
      query: "dentista perto de mim",
      cities,
    });
    expect(intent.flags.nearMe).toBe(true);
    expect(intent.normalizedText).toBe("dentista");
  });

  it("preserves bread queries with accents removed", () => {
    const intent = parseSearchIntent({
      cityId: "city-1",
      nicheId: "n1",
      query: "pão francês",
      cities,
    });
    expect(intent.normalizedText).toBe("pao frances");
    expect(intent.tokens).toEqual(["pao", "frances"]);
  });

  it("keeps alphanumeric tokens intact", () => {
    const intent = parseSearchIntent({
      cityId: "city-1",
      nicheId: "n1",
      query: "K27",
      cities,
    });
    expect(intent.tokens).toEqual(["k27"]);
    expect(intent.normalizedText).toBe("k27");
  });
});
