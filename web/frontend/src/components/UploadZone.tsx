import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uploadTrackWithProgress, analyzeTrack } from "../api/client";
import { formatTime } from "../utils/formatTime";

const ACCEPTED_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/mp3",
  "audio/wave",
]);

const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg"];
const MAX_SIZE_MB = 50;

function isAudioFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

/** Read media duration client-side without fully decoding the file. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.addEventListener("loadedmetadata", () => {
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    });
    audio.addEventListener("error", () => done(null));
    audio.src = url;
  });
}

type Phase = "idle" | "uploading" | "finalizing" | "starting";

function UploadZone() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const uploading = phase !== "idle";

  const clearState = useCallback(() => {
    setSelectedFile(null);
    setFileDuration(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!isAudioFile(file)) {
      setError("Выберите аудиофайл (MP3, WAV, FLAC, OGG).");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Файл слишком большой (> ${MAX_SIZE_MB} MB). Сократите или сожмите аудио.`);
      return;
    }
    setSelectedFile(file);
    setFileDuration(null);
    void probeDuration(file).then(setFileDuration);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (uploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, uploading]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!uploading) setDragOver(true);
    },
    [uploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile || uploading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("uploading");
    setProgress(0);
    setError(null);
    try {
      const track = await uploadTrackWithProgress(
        selectedFile,
        (ratio) => {
          if (ratio == null) {
            setPhase("finalizing");
            setProgress(1);
          } else {
            setProgress(ratio);
          }
        },
        controller.signal
      );
      setPhase("starting");
      await analyzeTrack(track.id);
      navigate(`/tracks/${track.id}`);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        // User cancelled — quietly reset to selected state
        setPhase("idle");
        setProgress(0);
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл. Повторите попытку.");
      setPhase("idle");
      setProgress(0);
    } finally {
      abortRef.current = null;
    }
  }, [selectedFile, uploading, navigate]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const pct = Math.round(progress * 100);
  const phaseLabel =
    phase === "uploading"
      ? `Загрузка · ${pct}%`
      : phase === "finalizing"
      ? "Обработка на сервере..."
      : phase === "starting"
      ? "Запуск анализа..."
      : "";

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${dragOver ? "upload-zone--dragover" : ""} ${
          selectedFile ? "upload-zone--has-file" : ""
        } ${uploading ? "upload-zone--busy" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !selectedFile && !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.flac,.ogg,audio/*"
          className="upload-input"
          onChange={handleInputChange}
          disabled={uploading}
        />

        {uploading && selectedFile ? (
          <div className="upload-zone-progress">
            <div className="upload-progress-head">
              <p className="upload-filename" title={selectedFile.name}>
                {selectedFile.name}
              </p>
              <p className="upload-progress-phase">{phaseLabel}</p>
            </div>
            <div
              className={`upload-progress-bar ${
                phase !== "uploading" ? "upload-progress-bar--indeterminate" : ""
              }`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={phase === "uploading" ? pct : undefined}
              aria-label={phaseLabel}
            >
              <div
                className="upload-progress-fill"
                style={{
                  width: phase === "uploading" ? `${pct}%` : "100%",
                }}
              />
            </div>
            <div className="upload-progress-meta">
              <span>
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                {fileDuration ? ` · ${formatTime(fileDuration)}` : ""}
              </span>
              {phase === "uploading" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleCancel}
                >
                  Отменить
                </button>
              ) : (
                <span className="upload-progress-hint">это займёт несколько секунд</span>
              )}
            </div>
          </div>
        ) : selectedFile ? (
          <div className="upload-zone-selected">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent)" aria-hidden="true">
              <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
            </svg>
            <p className="upload-filename" title={selectedFile.name}>
              {selectedFile.name}
            </p>
            <p className="upload-filesize">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              {fileDuration ? ` · ${formatTime(fileDuration)}` : ""}
            </p>
            <div className="upload-actions">
              <button className="btn btn-primary" onClick={handleUpload}>
                Загрузить и анализировать
              </button>
              <button className="btn btn-secondary" onClick={clearState}>
                Очистить
              </button>
            </div>
          </div>
        ) : (
          <div className="upload-zone-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-secondary)" aria-hidden="true">
              <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p className="upload-prompt">
              Перетащите аудиофайл сюда или нажмите для выбора
            </p>
            <p className="upload-hint">MP3, WAV, FLAC, OGG · до {MAX_SIZE_MB} MB</p>
          </div>
        )}
      </div>

      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}

export default UploadZone;
