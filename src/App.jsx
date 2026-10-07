import { useState } from "react";
import { getMe, signOut } from "./api/adminApi";
import { clearSession } from "./auth/session";
import Permissions from "./pages/Permissions";
import Roles from "./pages/Roles";
import Tournaments from "./pages/Tournaments";
import Users from "./pages/Users";
import { useLoad } from "./hooks";
import { ErrorBanner } from "./ui";

// The portal's shell: who is signed in, and a page per area — shown only when the signed-in role
// may use that area's list service (the server's ADMIN_ME says which). No router: the open page is
// remembered in this browser.

const PAGES = [
  { key: "tournaments", label: "Tournaments", service: "ADMIN_TOURNAMENT_LIST", Page: Tournaments },
  { key: "people", label: "People", service: "ADMIN_USER_LIST", Page: Users },
  { key: "roles", label: "Roles", service: "ADMIN_ROLE_LIST", Page: Roles },
  { key: "permissions", label: "Permissions", service: "ADMIN_PERMISSION_LIST", Page: Permissions },
];

const PAGE_KEY = "tournamentScheduler.admin.page";

function storedPage() {
  try {
    return localStorage.getItem(PAGE_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const me = useLoad(getMe, []);
  const [page, setPage] = useState(storedPage);

  const services = me.data?.services ?? [];
  const pages = PAGES.filter((p) => services.includes(p.service));
  const current = pages.find((p) => p.key === page) ?? pages[0];
  const can = (service) => services.includes(service);

  const open = (key) => {
    setPage(key);
    try {
      localStorage.setItem(PAGE_KEY, key);
    } catch {
      // Not remembering the page isn't worth failing the click over.
    }
  };

  // Signed out here even if the server can't be told: the button must always work.
  const leave = async () => {
    try {
      await signOut();
    } catch {
      // Already signed out on the server, or unreachable — either way, out here.
    }
    clearSession();
  };

  return (
    <div className="shell">
      <header className="topbar">
        <p className="brand" style={{ margin: 0 }}>
          <small>TOURNAMENT SCHEDULER</small>ADMIN PORTAL
        </p>
        <div className="who">
          {me.data && (
            <span>
              <strong>{me.data.name}</strong> · {me.data.roleName}
            </span>
          )}
          <button className="btn ghost-dark small" onClick={leave}>
            Sign out
          </button>
        </div>
      </header>

      {me.error && <ErrorBanner message={me.error} />}

      {me.data && pages.length === 0 && (
        <div className="card">
          <h2>NOTHING TO SHOW</h2>
          <p className="lead">Your role has no portal pages. Ask an admin to tick the ones you need.</p>
        </div>
      )}

      {current && (
        <>
          <nav className="nav" aria-label="Portal pages">
            {pages.map((p) => (
              <button key={p.key} aria-current={p.key === current.key ? "page" : undefined} onClick={() => open(p.key)}>
                {p.label.toUpperCase()}
              </button>
            ))}
          </nav>
          <current.Page key={current.key} can={can} me={me.data} />
        </>
      )}
    </div>
  );
}
