import {
  blobPathnameFor,
  capacityProblem,
  contentTypeFor,
  fileKind,
  safeRelPath,
  VMB_FILE_MAX_BYTES,
  VMB_PROJECT_MAX_FILES,
  VMB_UPLOAD_CONTENT_TYPES,
} from "@/lib/vmb/files";

describe("VMB project files", () => {
  it("knows the kinds VMB reads, by extension and in any case", () => {
    expect(fileKind("A-ground.DXF")).toBe("dxf");
    expect(fileKind("plans/קומה 1.dwg")).toBe("dwg");
    expect(fileKind("sheet.pdf")).toBe("pdf");
    expect(fileKind("set.dwfx")).toBe("dwf");
    expect(fileKind("site/IMG_0042.HEIC")).toBe("image");
    expect(fileKind("notes.docx")).toBeNull();
    expect(fileKind("Makefile")).toBeNull();
    expect(fileKind(".dxf")).toBeNull();
  });

  it("gives DXF and DWG a real content type, all of them allowed by the token", () => {
    expect(contentTypeFor("a.dxf")).toBe("image/vnd.dxf");
    for (const n of ["a.dxf", "a.dwg", "a.pdf", "a.dwf", "a.dwfx", "a.jpg", "a.png", "a.heic", "a.tif"]) {
      expect(VMB_UPLOAD_CONTENT_TYPES).toContain(contentTypeFor(n));
    }
  });

  it("keeps folder structure but strips anything that could escape it", () => {
    expect(safeRelPath("פרויקט/תוכניות/A-01.dxf")).toBe("פרויקט/תוכניות/A-01.dxf");
    expect(safeRelPath("\\win\\path\\a.dxf")).toBe("win/path/a.dxf");
    expect(safeRelPath("../../etc/passwd")).toBe("etc/passwd");
    expect(safeRelPath("/abs/./a.pdf")).toBe("abs/a.pdf");
    expect(safeRelPath("a\u0000b.pdf")).toBe("ab.pdf");
    expect(safeRelPath("../..")).toBeNull();
    expect(safeRelPath("x/".repeat(200) + "a.pdf")).toBeNull();
  });

  it("puts every file under its own project's prefix", () => {
    expect(blobPathnameFor("p1", "plans/a.dxf")).toBe("vmb/p1/plans/a.dxf");
  });

  it("refuses an oversized file, too many files, or a project over its total", () => {
    expect(capacityProblem([{ size: 10 }], 0, 0)).toBeNull();
    expect(capacityProblem([{ size: VMB_FILE_MAX_BYTES + 1 }], 0, 0)).toBe("file_too_large");
    expect(capacityProblem([{ size: 1 }], VMB_PROJECT_MAX_FILES, 0)).toBe("too_many_files");
    expect(capacityProblem([{ size: VMB_FILE_MAX_BYTES }], 0, 4 * 1024 ** 3 - 1)).toBe("project_too_large");
  });
});
