import {
  getDefaultLocation,
  getLocationById,
  resolveLocation,
  resolveLocationInput,
  searchLocations,
} from "@/lib/jewish-calendar/locations";

describe("jewish-calendar locations", () => {
  it("defaults to Jerusalem", () => {
    expect(getDefaultLocation().id).toBe("jerusalem");
  });

  it("finds city by id", () => {
    expect(getLocationById("tel-aviv")?.nameHe).toBe("תל אביב");
  });

  it("resolves nearest city to coordinates", () => {
    const loc = resolveLocation({ lat: 31.778, lng: 35.235 });
    expect(loc.id).toBe("jerusalem");
  });

  it("searches Hebrew and English names", () => {
    expect(searchLocations("חיפה").some((l) => l.id === "haifa")).toBe(true);
    expect(searchLocations("Haifa").some((l) => l.id === "haifa")).toBe(true);
  });

  it("resolveLocationInput prefers locationId", () => {
    const loc = resolveLocationInput({ locationId: "beer-sheva", lat: 32.08, lng: 34.78 });
    expect(loc.id).toBe("beer-sheva");
  });
});
