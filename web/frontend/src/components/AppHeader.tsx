import { NavLink, Link, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

/**
 * Application header.  Shows the brand mark + primary nav links.
 *
 * On narrow viewports we let the nav wrap below the brand (no hamburger —
 * with 4 short links, simple wrap is cleaner and zero JS).
 */
function AppHeader() {
  const { pathname } = useLocation();
  // Highlight the brand link only on the landing / library page, not on
  // the info pages (where the user might be "on" the site but the brand
  // shouldn't pretend to be the active page).
  const onTracks = pathname === "/" || pathname.startsWith("/tracks");

  return (
    <header className="app-header">
      <Link
        to="/"
        className={`app-logo-link ${onTracks ? "app-logo-link--active" : ""}`}
        aria-label="MusicML Timeline · на главную"
      >
        <span className="app-logo-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
            <rect x="1"  y="9"  width="2" height="4"  rx="1" />
            <rect x="5"  y="6"  width="2" height="10" rx="1" />
            <rect x="9"  y="2"  width="2" height="18" rx="1" />
            <rect x="13" y="5"  width="2" height="12" rx="1" />
            <rect x="17" y="8"  width="2" height="6"  rx="1" />
          </svg>
        </span>
        <span className="app-logo-text">
          <span className="app-logo-title">MusicML Timeline</span>
          <span className="app-logo-sub">
            Multi-task music structure &amp; affect analysis
          </span>
        </span>
      </Link>

      <nav className="app-nav" aria-label="Основное меню">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `app-nav-link ${isActive ? "app-nav-link--active" : ""}`
          }
        >
          Треки
        </NavLink>
        <NavLink
          to="/how-it-works"
          className={({ isActive }) =>
            `app-nav-link ${isActive ? "app-nav-link--active" : ""}`
          }
        >
          Как работает
        </NavLink>
        <NavLink
          to="/about"
          className={({ isActive }) =>
            `app-nav-link ${isActive ? "app-nav-link--active" : ""}`
          }
        >
          О проекте
        </NavLink>

        <span className="app-nav-divider" aria-hidden="true" />

        <ThemeToggle />

        <span className="app-version" title="Версия декодера пост-процесса">
          v2.1
        </span>
      </nav>
    </header>
  );
}

export default AppHeader;
