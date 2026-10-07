import { useMemo, useState } from "react";
import { getPermissions, getRoles, setPermissionDisabled, syncPermissions } from "../api/adminApi";
import { useAction, useLoad } from "../hooks";
import { ErrorBanner } from "../ui";

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

  return (
    <div className="card">
      <div className="toolbar">
        <input className="input grow" type="search" placeholder="Filter services" aria-label="Filter services" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="select" aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="all">All {total}</option>
          <option value="off">Switched off ({off})</option>
          <option value="gone">Gone from the code ({gone})</option>
        </select>
        {can("ADMIN_PERMISSION_SYNC") && (
          <button className="btn dark" onClick={sync} disabled={!!action.busy}>
            {action.busy === "sync" ? "Updating…" : "Update permissions"}
          </button>
        )}
      </div>

      <ErrorBanner message={permissions.error || action.error} />
      {notice && !action.error && <div className="notice">{notice}</div>}
      {permissions.loading && !permissions.data && <p className="empty">Loading…</p>}
      {permissions.data && groups.length === 0 && <p className="empty">Nothing matches.</p>}

      {groups.map(([controller, items]) => (
        <section className="group" key={controller}>
          <h3>{controller}</h3>
          <div className="table-wrap">
            <table className="fixed">
              <tbody>
                {items.map((p) => (
                  <tr key={p.permissionId}>
                    <td style={{ width: "40%" }}>
                      <code style={{ fontWeight: 600 }}>{p.serviceRequestId}</code>
                      <span className="sub">
                        {p.httpMethod} {p.url}
                      </span>
                    </td>
                    <td>
                      {p.isAnonymous && <span className="badge green">Signed out too</span>}
                      {p.isAdminOnly && <span className="badge amber">Portal</span>}
                      {p.isProtected && <span className="badge">Can't be switched off</span>}
                      {p.isObsolete && <span className="badge">Gone from the code</span>}
                      {p.isDisabled && <span className="badge red">Switched off</span>}
                    </td>
                    <td>
                      {p.isAnonymous ? (
                        <span className="sub">Everyone</span>
                      ) : p.roleIds.length === 0 ? (
                        <span className="sub">No role</span>
                      ) : (
                        <span className="sub">{p.roleIds.map(roleName).join(", ")}</span>
                      )}
                    </td>
                    <td className="actions">
                      {can("ADMIN_PERMISSION_SET_DISABLED") && p.canDisable && (
                        <button
                          className={`btn small ${p.isDisabled ? "primary" : "ghost"}`}
                          disabled={!!action.busy}
                          onClick={() => flip(p)}
                        >
                          {p.isDisabled ? "Switch on" : "Switch off"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
