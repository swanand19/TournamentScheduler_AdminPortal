import { useMemo, useState } from "react";
import { getPermissions, getRoles, setPermissionDisabled, syncPermissions } from "../api/adminApi";
import { useAction, useLoad } from "../hooks";
import { Empty, ErrorBanner, Loading } from "../ui";

// Every service the API has, as the permission sync found it, with who is ticked for it. Switching
// one off refuses it for everyone (sign-in and the protected ones can't be). "Update permissions"
// runs the same sync the API does at start-up — after a deploy, without a restart.

export default function Permissions({ can }) {
  const permissions = useLoad(getPermissions, []);
  const roles = useLoad(() => (can("ADMIN_ROLE_LIST") ? getRoles() : Promise.resolve([])), []);
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState("all"); // all | off | gone
  const [notice, setNotice] = useState("");
  const action = useAction();

  const roleName = (id) => roles.data?.find((r) => r.roleId === id)?.name ?? `Role ${id}`;

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const map = new Map();
    for (const p of permissions.data ?? []) {
      if (show === "off" && !p.isDisabled) continue;
      if (show === "gone" && !p.isObsolete) continue;
      if (term && !`${p.serviceRequestId} ${p.controllerName} ${p.url}`.toLowerCase().includes(term)) continue;
      if (!map.has(p.controllerName)) map.set(p.controllerName, []);
      map.get(p.controllerName).push(p);
    }
    return [...map.entries()];
  }, [permissions.data, filter, show]);

  const sync = () =>
    action.run("sync", async () => {
      const result = await syncPermissions();
      setNotice(result.message);
      permissions.reload();
    });

  const flip = (p) => {
    const off = !p.isDisabled;
    if (off && !window.confirm(`Switch off ${p.serviceRequestId}?\n\nNobody — in the apps or here — can use it until it's switched back on.`)) return;
    action.run(`flip-${p.permissionId}`, async () => {
      const updated = await setPermissionDisabled(p.permissionId, off);
      permissions.setData(permissions.data.map((x) => (x.permissionId === updated.permissionId ? updated : x)));
      setNotice(`${updated.serviceRequestId} is ${updated.isDisabled ? "switched off" : "back on"}.`);
    });
  };

  const total = permissions.data?.length ?? 0;
  const off = permissions.data?.filter((p) => p.isDisabled).length ?? 0;
  const gone = permissions.data?.filter((p) => p.isObsolete).length ?? 0;

  const tiles = [
    { key: "all", label: "Services", value: total },
    { key: "off", label: "Switched off", value: off, red: true },
    { key: "gone", label: "Gone from the code", value: gone },
  ];

  return (
    <div className="card">
      <div className="tallies" role="group" aria-label="Show">
        {tiles.map((t) => (
          <button key={t.key} className={`tally-tile${t.red && t.value > 0 ? " red" : ""}`} aria-pressed={show === t.key} onClick={() => setShow(t.key)}>
            <span>{t.label}</span>
            <b>{permissions.data ? t.value : "–"}</b>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="input grow" type="search" placeholder="Filter services" aria-label="Filter services" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {can("ADMIN_PERMISSION_SYNC") && (
          <button className="btn dark" onClick={sync} disabled={!!action.busy}>
            {action.busy === "sync" ? "Updating…" : "↻ Update permissions"}
          </button>
        )}
      </div>

      <ErrorBanner message={permissions.error || action.error} />
      {notice && !action.error && <div className="notice">{notice}</div>}
      {permissions.loading && !permissions.data && <Loading />}
      {permissions.data && groups.length === 0 && <Empty>Nothing matches.</Empty>}

      {groups.map(([controller, items]) => (
        <section className="group" key={controller}>
          <h3>
            {controller}
            <span className="tally">{items.length}</span>
          </h3>
          {items.map((p) => (
            <div className={`perm-row${p.isDisabled ? " off" : ""}`} key={p.permissionId}>
              <div>
                <code>{p.serviceRequestId}</code>
                <span className="sub">
                  <span className={`method ${p.httpMethod?.toLowerCase()}`}>{p.httpMethod}</span>
                  {p.url}
                </span>
              </div>
              <div>
                {p.isAnonymous && <span className="badge green">Signed out too</span>}
                {p.isAdminOnly && <span className="badge amber">Portal</span>}
                {p.isProtected && <span className="badge">🔒 Can't be switched off</span>}
                {p.isObsolete && <span className="badge">Gone from the code</span>}
                {p.isDisabled && <span className="badge red">Switched off</span>}
              </div>
              <div className="who-can">{p.isAnonymous ? "Everyone" : p.roleIds.length === 0 ? "No role" : p.roleIds.map(roleName).join(", ")}</div>
              <div>
                {can("ADMIN_PERMISSION_SET_DISABLED") && p.canDisable && (
                  <button
                    className="switch"
                    role="switch"
                    aria-checked={!p.isDisabled}
                    aria-label={`${p.serviceRequestId} is ${p.isDisabled ? "off" : "on"}`}
                    disabled={!!action.busy}
                    onClick={() => flip(p)}
                  >
                    <span className="track" aria-hidden="true" />
                    <span className="label">{p.isDisabled ? "Off" : "On"}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
