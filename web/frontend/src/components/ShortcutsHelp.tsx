import { useEffect, useRef, useState } from "react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["Space"], label: "Воспроизведение / пауза" },
  { keys: ["←", "→"], label: "Перемотка ±5 с" },
  { keys: ["Shift", "←", "→"], label: "Перемотка ±15 с" },
  { keys: ["Home"], label: "К началу трека" },
  { keys: ["End"], label: "В конец трека" },
  { keys: ["Click", "на оси"], label: "Фиксация момента (PIN)" },
];

function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="shortcuts-help" ref={rootRef}>
      <button
        type="button"
        className={`shortcuts-help-btn ${open ? "shortcuts-help-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Показать горячие клавиши"
        aria-expanded={open}
        title="Горячие клавиши"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" strokeLinecap="round" />
        </svg>
        <span className="shortcuts-help-btn-label">Клавиши</span>
      </button>
      {open && (
        <div className="shortcuts-help-popover" role="dialog" aria-label="Горячие клавиши">
          <div className="shortcuts-help-header">
            <span>Горячие клавиши</span>
            <button
              type="button"
              className="shortcuts-help-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <ul className="shortcuts-help-list">
            {SHORTCUTS.map((s, i) => (
              <li key={i} className="shortcuts-help-row">
                <span className="shortcuts-help-keys">
                  {s.keys.map((k, ki) => (
                    <span key={ki}>
                      {ki > 0 && <span className="shortcuts-help-plus">+</span>}
                      <kbd className="shortcuts-help-kbd">{k}</kbd>
                    </span>
                  ))}
                </span>
                <span className="shortcuts-help-label">{s.label}</span>
              </li>
            ))}
          </ul>
          <p className="shortcuts-help-hint">Esc — закрыть</p>
        </div>
      )}
    </div>
  );
}

export default ShortcutsHelp;
