import {
  floorplanBlobFileName,
  isFloorplanBlobUrl,
} from "@/lib/projects/floorplan-blob";

describe("floorplan blob urls", () => {
  it("accepts only this project's blob host over https", () => {
    expect(isFloorplanBlobUrl("https://abc123.public.blob.vercel-storage.com/plan-x9.pdf")).toBe(true);
    expect(isFloorplanBlobUrl("https://public.blob.vercel-storage.com/plan.pdf")).toBe(true);
  });

  it("refuses a URL that only looks like the blob host", () => {
    // The URL arrives in a request body, so each of these is something a caller
    // chose for us — an internal address, a lookalike domain, a local file.
    for (const raw of [
      "http://abc.public.blob.vercel-storage.com/plan.pdf",
      "https://public.blob.vercel-storage.com.evil.test/plan.pdf",
      "https://evil.test/public.blob.vercel-storage.com/plan.pdf",
      "https://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/api/projects",
      "file:///etc/passwd",
      "not a url",
      "",
    ]) {
      expect(isFloorplanBlobUrl(raw)).toBe(false);
    }
  });

  it("reads the uploaded file's own name back out of the url", () => {
    expect(floorplanBlobFileName("https://a.public.blob.vercel-storage.com/%D7%93%D7%99%D7%A8%D7%94%2014.pdf")).toBe(
      "דירה 14.pdf",
    );
    expect(floorplanBlobFileName("https://a.public.blob.vercel-storage.com/")).toBeUndefined();
    expect(floorplanBlobFileName("nonsense")).toBeUndefined();
  });
});
