import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { uploadTrack, analyzeTrack } from "../api/client";

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

function isAudioFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function UploadZone() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!isAudioFile(file)) {
      setError("Please select an audio file (MP3, WAV, FLAC, OGG).");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

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
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const track = await uploadTrack(selectedFile);
      await analyzeTrack(track.id);
      navigate(`/tracks/${track.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setUploading(false);
    }
  }, [selectedFile, navigate]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${dragOver ? "upload-zone--dragover" : ""} ${
          selectedFile ? "upload-zone--has-file" : ""
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !selectedFile && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.flac,.ogg,audio/*"
          className="upload-input"
          onChange={handleInputChange}
        />

        {uploading ? (
          <div className="upload-zone-uploading">
            <div className="spinner" />
            <p>Uploading and starting analysis...</p>
          </div>
        ) : selectedFile ? (
          <div className="upload-zone-selected">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
            </svg>
            <p className="upload-filename">{selectedFile.name}</p>
            <p className="upload-filesize">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
            </p>
            <div className="upload-actions">
              <button className="btn btn-primary" onClick={handleUpload}>
                Upload &amp; Analyze
              </button>
              <button className="btn btn-secondary" onClick={handleClear}>
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="upload-zone-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-secondary)">
              <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p className="upload-prompt">
              Drag &amp; drop an audio file here, or click to browse
            </p>
            <p className="upload-hint">MP3, WAV, FLAC, OGG</p>
          </div>
        )}
      </div>

      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}

export default UploadZone;
