import { useState } from "react";
import { getTournaments, reopenTournament, setTournamentHidden } from "../api/adminApi";
import { day, shortDate, useAction, useDebounced, useLoad } from "../hooks";
import { Empty, ErrorBanner, Loading, Pager } from "../ui";

// Every tournament, in three server-paged lists: Live, Upcoming, Past (completed and cancelled).
// The portal doesn't go inside tournaments; it shows who runs each one, reopens one that was
// closed by mistake (a new end date is needed when the old one has passed), and hides one from the
// public — every tournament is public otherwise (2026-11-23), so this is the takedown for a complaint.

const VIEWS = [
  { key: "Live", label: "Live" },
  { key: "Upcoming", label: "Upcoming" },
  { key: "Past", label: "Past" },
];
const PAGE_SIZE = 20;
const FLAGS = { Live: "Live now", Upcoming: "Upcoming", Past: "Full time" };

/** The stub's big date: "12" and "OCT 2026" from "2026-10-12". */
function stubDate(iso) {
  if (!iso) return { dd: "—", rest: "NO DATES" };
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  return { dd: String(d).padStart(2, "0"), rest: `${month} ${y}` };
}

export default function Tournaments({ can }) {
  const [view, setView] = useState("Live");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reopening, setReopening] = useState(null); // { id, name, endDate }
  const [hiding, setHiding] = useState(null); // { id, name }
  const query = useDebounced(search);
  const list = useLoad(() => getTournaments({ view, search: query, page, pageSize: PAGE_SIZE }), [view, query, page]);
  const action = useAction();

  const choose = (next) => {
    setView(next);
    setPage(1);
  };

  const reopen = (e) => {
    e.preventDefault();
    action.run("reopen", async () => {
      await reopenTournament(reopening.id, reopening.endDate);
      setReopening(null);
      list.reload();
    });
  };

  // Hiding is asked first (followers lose it at once); showing it again isn't.
  const setHidden = (id, hidden) =>
    action.run(`hide-${id}`, async () => {
      await setTournamentHidden(id, hidden);
      setHiding(null);
      list.reload();
    });

  const data = list.data;
  return (
    <div className="on-pitch">
      <div className="toolbar">
        <div className="segments" role="group" aria-label="Which tournaments">
          {VIEWS.map((v) => (
            <button key={v.key} aria-pressed={view === v.key} onClick={() => choose(v.key)}>
              {v.key === "Live" && <span className="live-dot" aria-hidden="true" />}
              {v.label}
              <span className="count">{data?.counts ? data.counts[v.key] : "–"}</span>
            </button>
          ))}
        </div>
        <input
          className="input grow"
          type="search"
          placeholder="Search by name"
          aria-label="Search tournaments by name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <ErrorBanner message={list.error || action.error} />

      {reopening && (
        <form onSubmit={reopen} className="review">
          <span className="tag">REOPEN</span>
          <span>
            Reopen <strong>{reopening.name}</strong>? A new end date is needed if its old one has passed.
          </span>
          <input
            className="input"
            type="date"
            aria-label="New end date (optional)"
            value={reopening.endDate}
            onChange={(e) => setReopening((r) => ({ ...r, endDate: e.target.value }))}
          />
          <button className="btn primary small" disabled={!!action.busy}>
            {action.busy ? "Reopening…" : "Reopen"}
          </button>
          <button type="button" className="btn ghost small" onClick={() => setReopening(null)}>
            Cancel
          </button>
        </form>
      )}

      {hiding && (
        <div className="review" role="group" aria-label="Hide from the public">
          <span className="tag">HIDE</span>
          <span>
            Hide <strong>{hiding.name}</strong> from the public? Its link, its public pages and search stop working, and its
            followers lose it. The people in it still see it. You can show it again later; the link stays the same.
          </span>
          <button className="btn primary small" disabled={!!action.busy} onClick={() => setHidden(hiding.id, true)}>
            {action.busy ? "Hiding…" : "Hide"}
          </button>
          <button type="button" className="btn ghost small" onClick={() => setHiding(null)}>
            Cancel
          </button>
        </div>
      )}

      {list.loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>{query ? "No tournaments match that name." : `No ${view.toLowerCase()} tournaments.`}</Empty>}

      {data && data.items.length > 0 && (
        <div className="tickets">
          {data.items.map((t) => {
            const { dd, rest } = stubDate(t.startDate);
            const cricket = t.sport === "Cricket";
            return (
              <article className={`ticket ${cricket ? "cricket" : "football"}`} key={t.id}>
                <div className="stub">
                  <span className="sport">{cricket ? "🏏 Cricket" : "⚽ Football"}</span>
                  <span className="day">{dd}</span>
                  <span className="month">{rest}</span>
                </div>
                <div className="main">
                  {t.status === "Cancelled" ? (
                    <span className="flag">
                      <span className="stamp">VOID</span> Cancelled
                    </span>
                  ) : (
                    <span className={`flag ${view === "Live" ? "live" : ""}`}>
                      {view === "Live" && <span className="live-dot" aria-hidden="true" />}
                      {FLAGS[view]}
                    </span>
                  )}
                  <h3>{t.name}</h3>
                  <div className="meta">
                    <code>#{t.id}</code>
                    <span>{t.startDate ? `${day(t.startDate)} – ${day(t.endDate)}` : "No dates"}</span>
                    <span>
                      by <strong style={{ color: "var(--ink)" }}>{t.creator.name}</strong>
                      {t.creatorEmail && ` · ${t.creatorEmail}`}
                    </span>
                    {t.hidden && <strong style={{ color: "var(--danger-ink)" }}>Hidden from the public</strong>}
                  </div>
                </div>
                <div className="stats">
                  <div className="stat">
                    <b>{t.teams}</b>
                    <span>Teams</span>
                  </div>
                  <div className="stat">
                    <b>{t.people}</b>
                    <span>People</span>
                  </div>
                </div>
                <div className="end">
                  <span className="when">
                    {view === "Past" ? "Closed" : "Created"}
                    <strong>{shortDate(view === "Past" ? t.completedAt ?? t.createdAt : t.createdAt)}</strong>
                  </span>
                  {t.canReopen && can("ADMIN_TOURNAMENT_REOPEN") && (
                    <button className="btn dark small" onClick={() => setReopening({ id: t.id, name: t.name, endDate: "" })}>
                      Reopen…
                    </button>
                  )}
                  {can("ADMIN_TOURNAMENT_HIDE") &&
                    (t.hidden ? (
                      <button className="btn ghost small" disabled={!!action.busy} onClick={() => setHidden(t.id, false)}>
                        Show to the public
                      </button>
                    ) : (
                      <button className="btn ghost small" onClick={() => setHiding({ id: t.id, name: t.name })}>
                        Hide from the public…
                      </button>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {data && data.total > 0 && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
