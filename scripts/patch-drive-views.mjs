import fs from "fs";

const path = "components/os/widgets/GoogleDriveWidget.tsx";
let s = fs.readFileSync(path, "utf8");
const replacement = fs.readFileSync("scripts/patch-drive-replacement.txt", "utf8");

const needle = '<div className="grid grid-cols-1 divide-y divide-[color:var(--border-main)]">';
const idx = s.indexOf(needle);

if (idx < 0) {
  console.error("needle not found");
  process.exit(1);
}

const start = s.lastIndexOf("        ) : (", idx);
const endMarker =
  '<motionless className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30';
const endMarker2 =
  '<div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30';
let end = s.indexOf(endMarker2, idx);
if (end < 0) end = s.indexOf(endMarker.replace("motionless", "motionless"), idx);

if (start < 0 || end < 0) {
  console.error("bounds not found", { start, end, idx });
  process.exit(1);
}

const closeIdx = s.lastIndexOf("        )}", end);
const sliceEnd = closeIdx >= start ? closeIdx + "        )}".length : end;

s = s.slice(0, start) + replacement + "\n" + s.slice(sliceEnd);
fs.writeFileSync(path, s);
console.log("patched", { start, sliceEnd });
