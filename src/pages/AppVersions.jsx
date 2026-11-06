import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createAppVersion, getAppVersions, setAppVersionDisabled, updateAppVersion } from "../api/adminApi";
import { parseUtc, shortDate, useAction, useLoad } from "../hooks";
import { Empty, ErrorBanner, Loading, Pager } from "../ui";

// App versions (HLD P-25): every release of the phone app, Android and iOS in one list, newest first.
// One backend serves every version; this list only says which is the latest and whether people on an
// older one must update. The server decides where each release stands and refuses bad input in words;
// the page shows the consequences before anything is saved — above all, how many devices a forced
// update would stop.

const PAGE_SIZE = 20;
const PLATFORMS = ["Android", "iOS"];
const STORE = { Android: "Google Play", iOS: "the App Store" };

const STATES = {
  Latest: { label: "Latest", badge: "green", hint: "The newest released version." },
  Supported: { label: "Supported", badge: "", hint: "Older than the latest; people on it see a “new version” banner." },
  MustUpdate: { label: "Must update", badge: "red card-red", hint: "A newer release requires an update: people on it can't use the app." },
  Scheduled: { label: "Scheduled", badge: "amber", hint: "Entered ahead of its release date: not offered yet." },
  Withdrawn: { label: "Withdrawn", badge: "ink", hint: "A pulled build: ignored everywhere." },
};

/** "1.10.0" > "1.9.9": versions compare as numbers, the way the server compares them. */
function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const VERSION_SHAPE = /^\d{1,5}(\.\d{1,5}){1,3}$/;

const pad = (n) => String(n).padStart(2, "0");

/** A UTC time from the server, as the value of a datetime-local input (this computer's time). */
function toLocalInput(value) {
  const d = parseUtc(value) ?? new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const when = (value) =>
  parseUtc(value)?.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) ?? "—";

function PlatformMark({ platform }) {
  return (
    <span className={`platform ${platform === "iOS" ? "ios" : "android"}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {platform === "iOS" ? (
          <path d="M11.2 8.5c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.1-.6C4.5 4.7 3.4 5.4 2.9 6.5c-1.2 2-.3 5 .8 6.6.6.8 1.2 1.7 2 1.6.8 0 1.1-.5 2.1-.5s1.2.5 2.1.5c.9 0 1.4-.8 1.9-1.6.6-.9.9-1.8.9-1.8s-1.5-.6-1.5-2.8ZM9.6 3.6c.4-.5.7-1.2.6-1.9-.6 0-1.4.4-1.8.9-.4.4-.7 1.1-.6 1.8.7.1 1.4-.3 1.8-.8Z" />
        ) : (
          <path d="M4.6 6h6.8v5.2c0 .4-.3.8-.8.8H10v1.7a.8.8 0 0 1-1.6 0V12H7.6v1.7a.8.8 0 0 1-1.6 0V12h-.6a.8.8 0 0 1-.8-.8V6Zm-1.5 0c.5 0 .8.4.8.8v3a.8.8 0 0 1-1.6 0v-3c0-.4.4-.8.8-.8Zm9.8 0c.5 0 .8.4.8.8v3a.8.8 0 0 1-1.6 0v-3c0-.4.4-.8.8-.8ZM10.4 2.4l.7-1a.2.2 0 0 0-.3-.2l-.7 1A4.1 4.1 0 0 0 8 1.7c-.7 0-1.4.2-2 .5l-.7-1a.2.2 0 0 0-.3.2l.7 1A3.4 3.4 0 0 0 4.6 5.3h6.8c0-1.2-.5-2.2-1-2.9ZM6.4 4.2a.4.4 0 1 1 0-.8.4.4 0 0 1 0 .8Zm3.2 0a.4.4 0 1 1 0-.8.4.4 0 0 1 0 .8Z" />
        )}
      </svg>
      {platform}
    </span>
  );
}

/** One platform's line: what's out, what's required, and who is behind. */
function PlatformBoard({ summary, activeDays }) {
  const { platform, latestVersion, requiredFrom, devicesBlocked, devicesBehind } = summary;
  return (
    <section className="platform-board" aria-label={`${platform} summary`}>
      <PlatformMark platform={platform} />
      <div className="board-cell">
        <span>Latest</span>
        <b>{latestVersion ?? "—"}</b>
      </div>
      <div className="board-cell">
        <span>Must update below</span>
        <b className={requiredFrom ? "warn" : undefined}>{requiredFrom ?? "None"}</b>
      </div>
      <div className="board-cell">
        <span>Can't use the app</span>
        <b className={devicesBlocked ? "danger" : undefined}>{devicesBlocked}</b>
      </div>
      <div className="board-cell">
        <span>Seeing the banner</span>
        <b>{devicesBehind}</b>
      </div>
      <p className="board-note">
        {latestVersion
          ? `Devices used in the last ${activeDays} days.`
          : "Nothing released yet — nobody is asked to update."}
      </p>
    </section>
  );
}

export default function AppVersions({ can }) {
  const list = useLoad(getAppVersions, []);
  const action = useAction();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null | { mode: "new" | "edit" | "copy", release? }

  const data = list.data;
  const canEdit = can("ADMIN_APP_VERSION_CREATE");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (r) =>
        (!platform || r.platform === platform) &&
        (!state || r.state === state) &&
        (!q || [r.appVersion, r.apiVersion, r.description].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [data, search, platform, state]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of data?.items ?? []) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [data]);

  const pageItems = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filter = (set) => (e) => {
    set(e.target.value);
    setPage(1);
  };

  const withdraw = (r) => {
    const going = !r.isDisabled;
    const question = going
      ? `Withdraw ${r.platform} ${r.appVersion}?\n\nThe app stops treating it as released: it's no longer the latest${r.isForceUpdate ? ", and its forced update stops applying" : ""}. People already on it keep using it.`
      : `Bring back ${r.platform} ${r.appVersion}?\n\nIt counts as released again${r.isForceUpdate ? ", and its forced update applies again" : ""}.`;
    if (!window.confirm(question)) return;
    action.run(`withdraw-${r.appStartId}`, async () => {
      list.setData(await setAppVersionDisabled(r.appStartId, going));
      setNotice(`${r.platform} ${r.appVersion} is ${going ? "withdrawn" : "back on the list"}.`);
    });
  };

  // The device counts decide whether forcing is safe, so they're fetched fresh whenever the form opens.
  const openForm = (what) => {
    list.reload();
    setEditing(what);
  };

  const saved = (next, message) => {
    list.setData(next);
    setEditing(null);
    setNotice(message);
  };

  return (
    <>
      {data && (
        <div className="platform-boards">
          {data.platforms.map((p) => (
            <PlatformBoard key={p.platform} summary={p} activeDays={data.activeDays} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <input
            className="input grow"
            type="search"
            placeholder="Search versions and notes"
            aria-label="Search by version, API version or what's new"
            value={search}
            onChange={filter(setSearch)}
          />
          <select className="select" aria-label="Platform" value={platform} onChange={filter(setPlatform)}>
            <option value="">Every platform</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Where it stands" value={state} onChange={filter(setState)}>
            <option value="">Every state</option>
            {Object.entries(STATES).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label} ({counts[key] ?? 0})
              </option>
            ))}
          </select>
          {canEdit && (
            <button className="btn primary" onClick={() => openForm({ mode: "new" })}>
              Add a release
            </button>
          )}
        </div>

        <ErrorBanner message={list.error || action.error} />
        {notice && !action.error && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}

        {list.loading && !data && <Loading />}
        {data && data.items.length === 0 && (
          <Empty>
            No releases yet, so nobody is asked to update.
            {canEdit && " Add the version that's in the store now to start."}
          </Empty>
        )}
        {data && data.items.length > 0 && shown.length === 0 && <Empty>No release matches that.</Empty>}

        {pageItems.length > 0 && (
          <div className="table-wrap">
            <table className="versions">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Released</th>
                  <th>What's new</th>
                  <th className="right">Devices</th>
                  <th>Last change</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const s = STATES[r.state] ?? STATES.Supported;
                  const busy = action.busy === `withdraw-${r.appStartId}`;
                  const other = r.platform === "Android" ? "iOS" : "Android";
                  return (
                    <tr key={r.appStartId} className={r.isDisabled ? "withdrawn" : undefined}>
                      <td>
                        <span className="version-num">{r.appVersion}</span>
                        {r.apiVersion && <span className="sub mono">API {r.apiVersion}</span>}
                      </td>
                      <td>
                        <PlatformMark platform={r.platform} />
                      </td>
                      <td>
                        <span className={`badge ${s.badge}`} title={s.hint}>
                          {s.label}
                        </span>
                        {r.isForceUpdate && <span className="sub force-note">Older versions must update</span>}
                      </td>
                      <td>
                        <span className="nowrap">{when(r.releaseDate)}</span>
                      </td>
                      <td className="notes">{r.description ? <span title={r.description}>{r.description}</span> : <span className="sub">—</span>}</td>
                      <td className="num right" title={`Devices on this version used in the last ${data.activeDays} days`}>
                        {r.devices}
                      </td>
                      <td>
                        <span className="nowrap">{r.changedBy ?? "—"}</span>
                        <span className="sub">{shortDate(r.changedAt)}</span>
                      </td>
                      <td className="actions">
                        {can("ADMIN_APP_VERSION_UPDATE") && (
                          <button className="btn ghost small" onClick={() => openForm({ mode: "edit", release: r })} aria-label={`Edit ${r.platform} ${r.appVersion}`}>
                            Edit
                          </button>
                        )}
                        {canEdit && (
                          <button
                            className="btn ghost small"
                            onClick={() => openForm({ mode: "copy", release: { ...r, platform: other } })}
                            aria-label={`Copy ${r.appVersion} to ${other}`}
                            title={`Start a ${other} release with these details`}
                          >
                            Copy to {other}
                          </button>
                        )}
                        {can("ADMIN_APP_VERSION_SET_DISABLED") && (
                          <button className={`btn small ${r.isDisabled ? "ghost" : "danger"}`} disabled={busy} onClick={() => withdraw(r)}>
                            {r.isDisabled ? "Bring back" : "Withdraw"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {shown.length > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />}
      </div>

      {editing && <ReleaseDrawer editing={editing} data={data} onClose={() => setEditing(null)} onSaved={saved} />}
    </>
  );
}

/** Devices on `platform` below `version`, from everything in use (on the list or not). */
function devicesBelow(data, platform, version) {
  if (!data || !VERSION_SHAPE.test(version ?? "")) return 0;
  return data.inUse.filter((u) => u.platform === platform && compareVersions(u.appVersion, version) < 0).reduce((n, u) => n + u.devices, 0);
}

function ReleaseDrawer({ editing, data, onClose, onSaved }) {
  const { mode, release } = editing;
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() => ({
    platform: release?.platform ?? "Android",
    appVersion: release?.appVersion ?? "",
    apiVersion: release?.apiVersion ?? "",
    description: release?.description ?? "",
    isForceUpdate: release?.isForceUpdate ?? false,
    releaseDate: isEdit ? toLocalInput(release.releaseDate) : toLocalInput(null),
    storeUrl: release?.storeUrl ?? "",
  }));
  const [initial] = useState(() => JSON.stringify(form));
  const [touched, setTouched] = useState(false);
  const action = useAction();
  const panel = useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const dirty = JSON.stringify(form) !== initial;
  const close = () => {
    if (dirty && !window.confirm("Close without saving? Your changes will be lost.")) return;
    onClose();
  };

  // A real modal: the page behind is inert (no tabbing or reading into it), focus starts in the
  // panel, Escape closes (asking first when there are changes), and focus goes back to the button
  // that opened it.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const opener = document.activeElement;
    const page = document.getElementById("root");
    if (page) page.inert = true;
    panel.current?.querySelector("input:not([type=radio]), textarea")?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (page) page.inert = false;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const versionOk = VERSION_SHAPE.test(form.appVersion.trim());
  const versionBad = (touched || form.appVersion !== "") && !versionOk;
  const releaseAt = form.releaseDate ? new Date(form.releaseDate) : null;
  const scheduled = releaseAt && releaseAt > new Date();
  const blocked = form.isForceUpdate ? devicesBelow(data, form.platform, form.appVersion.trim()) : 0;
  const latest = data?.platforms.find((p) => p.platform === form.platform)?.latestVersion;
  const olderThanLatest = latest && versionOk && compareVersions(form.appVersion.trim(), latest) < 0 && !(isEdit && release.appVersion === latest);
  const defaultStore = data?.defaultStoreUrls?.[form.platform];
  const descLeft = 500 - form.description.length;

  const save = (e) => {
    e.preventDefault();
    // Checked on submit, not by a disabled button: the reason shows beside the field, which gets focus.
    if (!versionOk) {
      setTouched(true);
      panel.current?.querySelector("#rel-version")?.focus();
      return;
    }
    if (!form.releaseDate) {
      action.setError("Choose the release date.");
      panel.current?.querySelector("#rel-date")?.focus();
      return;
    }
    if (form.isForceUpdate && blocked > 0 && !(isEdit && release.isForceUpdate)) {
      const ok = window.confirm(
        `Force the update to ${form.platform} ${form.appVersion.trim()}?\n\n${blocked} device${blocked === 1 ? "" : "s"} used in the last ${data.activeDays} days ${blocked === 1 ? "is" : "are"} on an older version and won't be able to use the app until ${blocked === 1 ? "it updates" : "they update"}${scheduled ? `, from ${when(releaseAt.toISOString())}` : ""}.`,
      );
      if (!ok) return;
    }
    const body = {
      platform: form.platform,
      appVersion: form.appVersion.trim(),
      apiVersion: form.apiVersion.trim() || null,
      description: form.description.trim() || null,
      isForceUpdate: form.isForceUpdate,
      releaseDate: releaseAt ? releaseAt.toISOString() : null,
      storeUrl: form.storeUrl.trim() || null,
    };
    action.run("save", async () => {
      const next = isEdit ? await updateAppVersion(release.appStartId, body) : await createAppVersion(body);
      onSaved(next, `${body.platform} ${body.appVersion} is ${isEdit ? "saved" : "on the list"}.`);
    });
  };

  const title = isEdit ? `Edit ${release.platform} ${release.appVersion}` : mode === "copy" ? `Add ${release.appVersion} for ${form.platform}` : "Add a release";

  return createPortal(
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="release-title" ref={panel}>
        <header className="drawer-head">
          <div>
            <p className="kicker">{isEdit ? "Release" : "New release"}</p>
            <h2 id="release-title">{title}</h2>
          </div>
          <button className="btn ghost small" onClick={close} aria-label="Close">
            Close
          </button>
        </header>

        <form className="drawer-body" onSubmit={save} noValidate>
          <ErrorBanner message={action.error} />

          <fieldset className="field">
            <legend>Platform</legend>
            <div className="seg-radio">
              {PLATFORMS.map((p) => (
                <label key={p} className={form.platform === p ? "on" : undefined}>
                  <input type="radio" name="platform" value={p} checked={form.platform === p} onChange={set("platform")} />
                  <PlatformMark platform={p} />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-row">
            <label className="field" htmlFor="rel-version">
              <span className="field-label">Version</span>
              <input
                id="rel-version"
                className="input mono"
                value={form.appVersion}
                onChange={set("appVersion")}
                placeholder="1.8.1"
                inputMode="decimal"
                autoComplete="off"
                aria-describedby="rel-version-hint"
                aria-invalid={versionBad}
              />
              <span id="rel-version-hint" className={`hint ${versionBad ? "bad" : ""}`}>
                {!versionBad
                  ? "As the store shows it."
                  : form.appVersion.trim()
                    ? "Write it as numbers separated by dots, like 1.8.1."
                    : "Enter the version as the store shows it, like 1.8.1."}
              </span>
            </label>
            <label className="field" htmlFor="rel-api">
              <span className="field-label">
                API version <span className="optional">optional</span>
              </span>
              <input id="rel-api" className="input mono" value={form.apiVersion} onChange={set("apiVersion")} placeholder="1.0.19" maxLength={20} autoComplete="off" />
              <span className="hint">For the record; every version uses the same server.</span>
            </label>
          </div>

          <label className="field" htmlFor="rel-date">
            <span className="field-label">Release date</span>
            <input id="rel-date" className="input" type="datetime-local" value={form.releaseDate} onChange={set("releaseDate")} />
            <span className="hint">
              {scheduled ? "In the future: it's listed as scheduled and offered from then." : "In your computer's time zone."}
            </span>
          </label>

          <label className="field" htmlFor="rel-notes">
            <span className="field-label">
              What's new <span className="optional">optional</span>
            </span>
            <textarea id="rel-notes" className="input" rows={3} value={form.description} onChange={set("description")} maxLength={500} placeholder="Live scores update the moment a ball is bowled." />
            <span className={`hint ${descLeft < 40 ? "bad" : ""}`}>Shown on the update banner and screen. {descLeft} characters left.</span>
          </label>

          <label className="field" htmlFor="rel-store">
            <span className="field-label">
              Store link <span className="optional">optional</span>
            </span>
            <input
              id="rel-store"
              className="input"
              type="url"
              value={form.storeUrl}
              onChange={set("storeUrl")}
              placeholder={defaultStore ?? "https://play.google.com/store/apps/details?id=…"}
              autoComplete="off"
            />
            <span className="hint">{defaultStore ? `Leave empty to use ${defaultStore}.` : `Where the Update button opens. Without one, the app just says to update from ${STORE[form.platform]}.`}</span>
          </label>

          <div className={`force ${form.isForceUpdate ? "on" : ""}`}>
            <label className="force-toggle" htmlFor="rel-force">
              <input id="rel-force" type="checkbox" checked={form.isForceUpdate} onChange={set("isForceUpdate")} />
              <span>
                <strong>Everyone on an older version must update</strong>
                <span className="sub">
                  Use for security fixes or after the support window. People below this version can't use the app until they update; signing out still works.
                </span>
              </span>
            </label>
            {form.isForceUpdate && versionOk && (
              <p className={`impact ${blocked ? "bad" : ""}`} role="status">
                {blocked
                  ? `${blocked} device${blocked === 1 ? "" : "s"} used in the last ${data?.activeDays ?? 30} days ${blocked === 1 ? "is" : "are"} on ${form.platform} below ${form.appVersion.trim()} and will be stopped.`
                  : `No device used in the last ${data?.activeDays ?? 30} days is on ${form.platform} below ${form.appVersion.trim()}.`}
              </p>
            )}
          </div>

          {olderThanLatest && (
            <p className="impact" role="note">
              {form.platform} {latest} is already out, so this version won't be the latest.
            </p>
          )}

          <div className="phone-preview" aria-label="What people on an older version see">
            <span className="preview-label">People on an older version see</span>
            {form.isForceUpdate ? (
              <div className="phone-screen">
                <strong>Update to keep using the app</strong>
                <p>Version {versionOk ? form.appVersion.trim() : "…"} is required. {form.description.trim()}</p>
                {form.storeUrl.trim() || defaultStore ? (
                  <span className="fake-btn">Update from {STORE[form.platform]}</span>
                ) : (
                  <span className="fake-link">Open {STORE[form.platform]} and update Tournament Scheduler.</span>
                )}
              </div>
            ) : (
              <div className="phone-banner">
                <strong>Version {versionOk ? form.appVersion.trim() : "…"} is available</strong>
                <p>{form.description.trim() || "Update for the latest fixes."}</p>
                <span className="fake-link">{form.storeUrl.trim() || defaultStore ? "Update · Not now" : "Not now"}</span>
              </div>
            )}
          </div>

          <footer className="drawer-foot">
            <button type="button" className="btn ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={action.busy === "save"}>
              {action.busy === "save" ? "Saving…" : isEdit ? "Save changes" : "Add release"}
            </button>
          </footer>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
