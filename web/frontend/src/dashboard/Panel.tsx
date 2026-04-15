import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Panel width in grid columns (1-4). Default: 2. */
  span?: 1 | 2 | 3 | 4;
  /** Apply reduced vertical padding for dense panels (e.g., timelines). */
  dense?: boolean;
  className?: string;
}

function Panel({ title, subtitle, actions, children, span = 2, dense, className }: PanelProps) {
  const classes = [
    "dash-panel",
    `dash-panel--span-${span}`,
    dense ? "dash-panel--dense" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      <header className="dash-panel-header">
        <div className="dash-panel-titles">
          <h3 className="dash-panel-title">{title}</h3>
          {subtitle && <p className="dash-panel-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="dash-panel-actions">{actions}</div>}
      </header>
      <div className="dash-panel-body">{children}</div>
    </section>
  );
}

export default Panel;
