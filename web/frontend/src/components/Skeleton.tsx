import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Primitive skeleton block with shimmer animation.
 * Use to build content-shaped placeholders that match the real layout.
 */
export function Skeleton({ width, height, radius, className, style }: SkeletonProps) {
  const mergedStyle: CSSProperties = {
    width: width ?? "100%",
    height: height ?? "1em",
    borderRadius: radius ?? 4,
    ...style,
  };
  return <span className={`skeleton ${className ?? ""}`.trim()} style={mergedStyle} aria-hidden="true" />;
}

/**
 * Skeleton for the track list page — matches the track-preview-card layout
 * so there's zero layout shift when real data arrives.
 */
export function TrackListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="track-grid" role="status" aria-label="Загрузка треков">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="track-preview-card track-preview-card--skeleton">
          <div className="track-preview-icon">
            <Skeleton width={20} height={20} radius="50%" />
          </div>
          <div className="track-preview-info">
            <Skeleton width={`${45 + ((i * 13) % 35)}%`} height={14} radius={3} style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Skeleton width={52} height={16} radius={10} />
              <Skeleton width={64} height={16} radius={10} />
              <Skeleton width={36} height={12} radius={3} />
            </div>
          </div>
          <div className="track-preview-arrow">
            <Skeleton width={14} height={14} radius={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for the dashboard page shown while a single track loads.
 * Mirrors the real dashboard layout: header + player + time axis + panel grid.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard-page" role="status" aria-label="Загрузка трека">
      {/* Sticky header */}
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <Skeleton width={92} height={30} radius={6} />
          <div className="dashboard-title-block" style={{ marginLeft: 4 }}>
            <Skeleton width={260} height={22} radius={4} style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Skeleton width={72} height={20} radius={10} />
              <Skeleton width={64} height={20} radius={10} />
              <Skeleton width={80} height={20} radius={10} />
            </div>
          </div>
        </div>
        <div className="dashboard-header-right">
          <Skeleton width={80} height={28} radius={6} />
        </div>
      </div>

      {/* Player row */}
      <div className="dashboard-player-row">
        <div className="skeleton-player">
          <Skeleton width={40} height={40} radius="50%" />
          <Skeleton width={56} height={12} radius={3} />
          <Skeleton height={6} radius={3} style={{ flex: 1 }} />
          <Skeleton width={56} height={12} radius={3} />
        </div>
      </div>

      {/* Time axis */}
      <div style={{ padding: "6px 0 10px" }}>
        <Skeleton height={16} radius={3} />
      </div>

      {/* Panel grid */}
      <div className="dashboard-grid">
        {[
          { title: 84, body: 110, span: 2 },
          { title: 110, body: 200, span: 2 },
          { title: 132, body: 280, span: 1 },
          { title: 72, body: 280, span: 1 },
          { title: 96, body: 220, span: 2 },
          { title: 120, body: 180, span: 2 },
        ].map((p, i) => (
          <section key={i} className={`dash-panel dash-panel--span-${p.span}`}>
            <header className="dash-panel-header">
              <div className="dash-panel-titles">
                <Skeleton width={p.title} height={10} radius={3} />
              </div>
            </header>
            <div className="dash-panel-body">
              <Skeleton height={p.body} radius={6} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
