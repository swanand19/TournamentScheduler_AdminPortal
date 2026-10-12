import { useEffect, useState } from "react";

// Small shared components: the error line, the pager, the empty and loading states, a person's
// initials disc, the page heading and the scorebug's clock.

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="range">
        <b>
          {from}–{to}
        </b>{" "}
        of {total}
      </span>
      <span>
        <button className="btn ghost small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Previous
        </button>
        <button className="btn ghost small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </span>
    </div>
  );
}

/** Nothing to list: a chalked half-pitch and the reason. */
export function Empty({ children }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="4" width="112" height="72" rx="2" />
        <path d="M60 4v72" />
        <circle cx="60" cy="40" r="12" />
        <rect x="4" y="22" width="18" height="36" />
        <rect x="98" y="22" width="18" height="36" />
      </svg>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

export function Loading({ rows = 4 }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

const SHIRTS = ["#1f5c45", "#7c1f1b", "#1d3f73", "#5b3a8a", "#9a5d06", "#22606b", "#3d3d3d", "#8a2f5a"];

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A person's initials on a shirt colour that stays the same for the same name. */
export function Jersey({ name }) {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span className="jersey" style={{ "--jersey": SHIRTS[Math.abs(hash) % SHIRTS.length] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PageHead({ kicker, title, lead, children }) {
  return (
    <div className="page-head">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

/** The scorebug's match clock: local time, with a ticking colon. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <span className="clock" aria-hidden="true">
      {hh}
      <span className="blink">:</span>
      {mm}
    </span>
  );
}

export function Scorebug() {
  return (
    <div className="scorebug">
      <span className="mark">TS</span>
      <span className="title">
        ADMIN PORTAL
        <small>TOURNAMENT SCHEDULER</small>
      </span>
      <Clock />
    </div>
  );
}
