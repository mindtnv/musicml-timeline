interface LoadingStateProps {
  message?: string;
  progress?: number;
}

function LoadingState({ message = "Анализ аудио...", progress }: LoadingStateProps) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <p className="loading-message">{message}</p>
      {progress !== undefined && progress >= 0 && (
        <div className="loading-progress-wrap">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="loading-progress-text">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
}

export default LoadingState;
