import { csvEscape, csvRow } from "@/lib/csv-escape";

describe("csv-escape", () => {
  it("escapes commas and quotes", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("builds a row", () => {
    expect(csvRow(["name", "foo,bar", 3])).toBe('name,"foo,bar",3');
  });
});
