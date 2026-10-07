import { useState } from "react";
import { getTournaments, reopenTournament } from "../api/adminApi";
import { day, shortDate, useAction, useDebounced, useLoad } from "../hooks";
import { ErrorBanner, Pager } from "../ui";

// Every tournament, in three server-paged lists: Live, Upcoming, Past (completed and cancelled).
// The portal doesn't go inside tournaments; it shows who runs each one, and reopens one that was
// closed by mistake (a new end date is needed when the old one has passed).

const VIEWS = [
  { key: "Live", label: "Live" },
  { key: "Upcoming", label: "Upcoming" },
  { key: "Past", label: "Past" },
];
const PAGE_SIZE = 20;

export default function Tournaments({ can }) {
  const [view, setView] = useState("Live");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reopening, setReopening] = useState(null); // { id, name, endDate }
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

  const data = list.data;
  return (
    <>
      <div className="tabs" role="group" aria-label="Which tournaments">
        {VIEWS.map((v) => (
          <button key={v.key} aria-pressed={view === v.key} onClick={() => choose(v.key)}>
            {v.label}
            {data?.counts && <span className="count">{data.counts[v.key]}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
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
          <form onSubmit={reopen} className="notice" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "var(--ink)" }}>
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

        {list.loading && !data && <p className="empty">Loading…</p>}
        {data && data.items.length === 0 && <p className="empty">{query ? "No tournaments match that name." : `No ${view.toLowerCase()} tournaments.`}</p>}

        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Dates</th>
                  <th>Created by</th>
                  <th>Teams</th>
                  <th>People</th>
                  <th>{view === "Past" ? "Closed" : "Created"}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.sport === "Cricket" ? "🏏" : "⚽"} <strong>{t.name}</strong>
                      {t.status === "Cancelled" && <span className="badge red" style={{ marginLeft: 6 }}>Cancelled</span>}
                      <span className="sub">#{t.id}</span>
                    </td>
                    <td>{t.startDate ? `${day(t.startDate)} – ${day(t.endDate)}` : <span className="sub">No dates</span>}</td>
                    <td>
                      {t.creator.name}
                      {t.creatorEmail && <span className="sub">{t.creatorEmail}</span>}
                    </td>
                    <td>{t.teams}</td>
                    <td>{t.people}</td>
                    <td>{shortDate(view === "Past" ? t.completedAt ?? t.createdAt : t.createdAt)}</td>
                    <td className="actions">
                      {t.canReopen && can("ADMIN_TOURNAMENT_REOPEN") && (
                        <button className="btn ghost small" onClick={() => setReopening({ id: t.id, name: t.name, endDate: "" })}>
                          Reopen…
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </>
  );
}
