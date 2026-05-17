import fs from "fs";
const p = "components/os/widgets/AiScannerWidget.tsx";
let s = fs.readFileSync(p, "utf8");
const old = `            <motion.div
              key={item.id}
              className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-2"
            >
              <motion.div className="truncate text-[10px] font-bold">{item.vendor}</motion.div>
              <motion.div className="text-[10px] font-mono text-emerald-600">₪{(item.amount || 0).toLocaleString()}</motion.div>
            </motion.div>`;

const neu = `            <motion.div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-2"
            >
              <motion.div className="min-w-0 flex-1">
                <motion.div className="truncate text-[10px] font-bold">{item.vendor}</motion.div>
                <motion.div className="text-[10px] font-mono text-emerald-600">₪{(item.amount || 0).toLocaleString()}</motion.div>
              </motion.div>
              <ItemActions onDelete={() => setHistory((prev) => prev.filter((h) => h.id !== item.id))} />
            </motion.div>`;

// use div not motion in old
const old2 = old.replace(/motion\./g, "");
const neu2 = neu.replace(/motion\./g, "");

if (!s.includes(old2)) {
  console.error("not found");
  process.exit(1);
}
s = s.replace(old2, neu2);
fs.writeFileSync(p, s);
console.log("ok");
