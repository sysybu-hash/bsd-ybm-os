/** A picked or dropped file with its path inside the chosen folder. */
export type PickedFile = { file: File; relPath: string };

type Entry = FileSystemEntry;

function readAll(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const out: Entry[] = [];
  // readEntries returns at most ~100 entries per call; keep reading until empty.
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(out);
        out.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walk(entry: Entry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, relPath: `${prefix}${entry.name}` });
    return;
  }
  if (entry.isDirectory) {
    for (const child of await readAll(entry as FileSystemDirectoryEntry)) {
      await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Everything in a drop: loose files and whole folders, walked recursively. */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is Entry => Boolean(e));
  if (entries.length === 0) return [...dt.files].map((file) => ({ file, relPath: file.name }));
  const out: PickedFile[] = [];
  for (const e of entries) await walk(e, "", out);
  return out;
}

/** From an <input type=file>, with or without webkitdirectory. */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return [...(list ?? [])].map((file) => ({ file, relPath: file.webkitRelativePath || file.name }));
}
