import { describe, expect, it } from "vitest";
import {
  countryCode,
  localizeCountryInDisplayName,
  localizedCountryName,
} from "../../src/client/CountryNames";

describe("country names in the player's language", () => {
  it("translates a whole country", () => {
    expect(localizedCountryName("Senegal", "sn", "fr")).toBe("Sénégal");
    expect(localizedCountryName("Benin", "bj", "fr")).toBe("Bénin");
    expect(localizedCountryName("Germany", "de", "es")).toBe("Alemania");
  });

  it("keeps regions named differently from their flag's country", () => {
    expect(countryCode("Punjab", "in")).toBeNull();
    expect(localizedCountryName("Bavaria", "de", "fr")).toBe("Bavaria");
    expect(localizedCountryName("Paris", "fr", "fr")).toBe("Paris");
  });

  it("knows manifest spellings that differ from the standard names", () => {
    expect(countryCode("DR Congo", "cd")).toBe("CD");
    expect(countryCode("Turkey", "tr")).toBe("TR");
    expect(countryCode("Bosnia and Herzegovina", "ba")).toBe("BA");
    // An alias only counts for its own country.
    expect(countryCode("Turkey", "gr")).toBeNull();
  });

  it("ignores flags that aren't ISO country codes", () => {
    expect(countryCode("Abbasid Caliphate", "Abbasid Caliphate")).toBeNull();
  });

  it("leaves names untouched when the language has no country names", () => {
    expect(localizedCountryName("Senegal", "sn", "not-a-language")).toBe(
      "Senegal",
    );
  });

  it("translates only the country part of a Nations-mode human name", () => {
    expect(
      localizeCountryInDisplayName("Senegal | Bastien", "sn", false, "fr"),
    ).toBe("Sénégal | Bastien");
    // A human called after a country keeps their name.
    expect(localizeCountryInDisplayName("Senegal", "sn", false, "fr")).toBe(
      "Senegal",
    );
    expect(localizeCountryInDisplayName("Senegal", "sn", true, "fr")).toBe(
      "Sénégal",
    );
  });
});
