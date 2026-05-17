import fs from "fs";

const p = "components/os/AdaptiveWidgetShell.tsx";
let s = fs.readFileSync(p, "utf8");

const dupBlock = `        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-600"
            aria-label={\`סגור \${title}\`}
          >
            <X size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onMaximize}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-card)] hover:text-[color:var(--foreground-main)] md:flex"
            aria-label={isMaximized ? \`הקטן \${title}\` : \`הגדל \${title}\`}
          >
            {isMaximized ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          </button>
        </motion.div>

        <h2 className="truncate px-3 text-xs font-black tracking-[0.12em] text-[color:var(--foreground-main)]">{title}</h2>

        <div className="flex items-center gap-1">`;

const newBlock = `        <div className="min-w-[2rem] flex-1" aria-hidden />

        <h2 className="max-w-[40%] truncate px-2 text-center text-xs font-black tracking-[0.12em] text-[color:var(--foreground-main)]">
          {title}
        </h2>

        <div className="flex flex-1 items-center justify-end gap-1">`;

if (!s.includes(dupBlock)) {
  // try CRLF
  const dupCrlf = dupBlock.replace(/\n/g, "\r\n");
  if (s.includes(dupCrlf)) {
    s = s.replace(dupCrlf, newBlock.replace(/\n/g, "\r\n"));
  } else {
    console.error("dup block not found");
    process.exit(1);
  }
} else {
  s = s.replace(dupBlock, newBlock);
}

if (s.includes("</motion.div>")) {
  s = s.replace("</motion.div>", "</motion.div>");
}

fs.writeFileSync(p, s);
console.log("ok");
