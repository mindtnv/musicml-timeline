import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ExportFormat,
  buildShareUrl,
  createShareLink,
  getExportUrl,
  getShareForTrack,
  revokeShareLink,
  type ShareRecord,
} from "../api/client";

interface Props {
  trackId: string;
  /** Disable interactive actions if analysis isn't complete yet. */
  disabled?: boolean;
}

interface ExportOption {
  key: ExportFormat;
  label: string;
  description: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { key: "json",    label: "JSON",          description: "Полный timeline + метаданные" },
  { key: "csv",     label: "CSV (frames)",  description: "Покадровые предсказания" },
  { key: "srt",     label: "SRT",           description: "Сегменты как субтитры" },
  { key: "markers", label: "DAW-метки",     description: "Audacity / Reaper labels" },
  { key: "md",      label: "Markdown",      description: "Человекочитаемый отчёт" },
];

/**
 * Share link + export dropdown. Placed next to other hero actions
 * (keyboard help, vibe, delete) on the track page.
 */
function ShareExportMenu({ trackId, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareRecord | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // On first open, check whether a share link already exists for this track
  // so we surface the current state rather than requiring a click.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!open || hydrated.current) return;
    hydrated.current = true;
    getShareForTrack(trackId).then((s) => setShare(s)).catch(() => {});
  }, [open, trackId]);

  // Close on outside click / Escape.
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

  const handleCreateShare = useCallback(async () => {
    if (shareBusy || disabled) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const rec = await createShareLink(trackId);
      setShare(rec);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Не удалось создать ссылку",
      );
    } finally {
      setShareBusy(false);
    }
  }, [trackId, shareBusy, disabled]);

  const handleRevoke = useCallback(async () => {
    if (!share || shareBusy) return;
    setShareBusy(true);
    try {
      await revokeShareLink(share.shareId);
      setShare(null);
      setCopied(false);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Не удалось отозвать ссылку",
      );
    } finally {
      setShareBusy(false);
    }
  }, [share, shareBusy]);

  const handleCopy = useCallback(async () => {
    if (!share) return;
    const url = buildShareUrl(share.shareId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail in insecure contexts — fall back to selecting the
      // input so the user can Ctrl+C manually.
      const input = rootRef.current?.querySelector(
        ".share-input",
      ) as HTMLInputElement | null;
      input?.select();
    }
  }, [share]);

  const shareUrl = share ? buildShareUrl(share.shareId) : "";

  return (
    <div className="share-export" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm share-export-btn ${open ? "share-export-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Поделиться и экспортировать"
        aria-label="Поделиться и экспортировать"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        <span className="share-export-btn-label">Поделиться</span>
      </button>

      {open && (
        <div className="share-export-popover" role="dialog" aria-label="Поделиться и экспортировать">
          <div className="share-export-section">
            <div className="share-export-section-title">Публичная ссылка</div>
            {share ? (
              <>
                <div className="share-input-row">
                  <input
                    className="share-input"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Публичная ссылка на анализ"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary share-copy-btn"
                    onClick={handleCopy}
                    title="Скопировать ссылку"
                  >
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <div className="share-hint">
                  Любой с этой ссылкой увидит анализ в режиме чтения.
                </div>
                <button
                  type="button"
                  className="share-revoke"
                  onClick={handleRevoke}
                  disabled={shareBusy}
                >
                  {shareBusy ? "Отзыв..." : "Отозвать ссылку"}
                </button>
              </>
            ) : (
              <>
                <div className="share-hint">
                  Сгенерируйте короткую ссылку на результат анализа — без
                  возможности правки или удаления.
                </div>
                <button
                  type="button"
                  className="btn btn-sm share-create-btn"
                  onClick={handleCreateShare}
                  disabled={shareBusy || disabled}
                >
                  {shareBusy ? "Создание..." : "Создать ссылку"}
                </button>
              </>
            )}
            {shareError && <div className="share-error">{shareError}</div>}
          </div>

          <div className="share-export-divider" role="presentation" />

          <div className="share-export-section">
            <div className="share-export-section-title">Экспорт</div>
            <ul className="share-export-list">
              {EXPORT_OPTIONS.map((opt) => (
                <li key={opt.key}>
                  <a
                    className="share-export-item"
                    href={getExportUrl(trackId, opt.key)}
                    download
                    aria-label={`Скачать ${opt.label} — ${opt.description}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="share-export-item-label">{opt.label}</span>
                    <span className="share-export-item-desc">{opt.description}</span>
                    <span className="share-export-item-icon" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShareExportMenu;
