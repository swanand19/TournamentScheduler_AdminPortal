import { useMemo, useState } from "react";
import { createRole, deleteRole, getRolePermissions, getRoles, saveRolePermissions, updateRole } from "../api/adminApi";
import { useAction, useLoad } from "../hooks";
import { ErrorBanner } from "../ui";

// Roles, and the role editor: every service as a tick box, grouped by area, saved as a whole set.
// Boxes the server locks (sign-in for everyone, what Admin always keeps, portal services for
// EndUser) show why instead of being clickable. Admin and EndUser can't be renamed or deleted.

export default function Roles({ can }) {
  const roles = useLoad(getRoles, []);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const action = useAction();

  const role = roles.data?.find((r) => r.roleId === selected) ?? roles.data?.[0];

  const add = (e) => {
    e.preventDefault();
    action.run("create", async () => {
      const created = await createRole(draft.name.trim(), draft.description.trim());
      setDraft({ name: "", description: "" });
      setAdding(false);
      roles.reload();
      setSelected(created.roleId);
    });
  };

  return (
    <div className="layout-2">
      <div className="card">
        <h2>ROLES</h2>
        <p className="lead">Each person has one. Pick a role to see what it may do.</p>
        <ErrorBanner message={roles.error} />
        <ul className="role-list">
          {roles.data?.map((r) => (
            <li key={r.roleId}>
              <button aria-current={r.roleId === role?.roleId} onClick={() => setSelected(r.roleId)}>
                {r.name}
                {r.portalAccess && <span className="badge amber" style={{ marginLeft: 6 }}>Portal</span>}
                <span className="sub">
                  {r.users} {r.users === 1 ? "person" : "people"} · {r.ticks} ticked
                </span>
              </button>
            </li>
          ))}
        </ul>

        {can("ADMIN_ROLE_CREATE") &&
          (adding ? (
            <form onSubmit={add} style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <ErrorBanner message={action.error} />
              <input className="input" placeholder="Name, e.g. Support" aria-label="New role's name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
              <input className="input" placeholder="What it's for (optional)" aria-label="New role's description" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary small" disabled={!draft.name.trim() || !!action.busy}>
                  {action.busy ? "Adding…" : "Add role"}
                </button>
                <button type="button" className="btn ghost small" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
              <p className="sub" style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
                A new role starts with nothing ticked.
              </p>
            </form>
          ) : (
            <button className="btn ghost small" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
              + New role
            </button>
          ))}
      </div>

      {role && (
        <RoleEditor
          key={role.roleId}
          role={role}
          can={can}
          onChanged={roles.reload}
          onDeleted={() => {
            setSelected(null);
            roles.reload();
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({ role, can, onChanged, onDeleted }) {
  const ticks = useLoad(() => getRolePermissions(role.roleId), [role.roleId]);
  const [picked, setPicked] = useState(null); // the edited set, once anything changes
  const [filter, setFilter] = useState("");
  const [details, setDetails] = useState({ name: role.name, description: role.description ?? "" });
  const [notice, setNotice] = useState("");
  const action = useAction();
  const editable = can("ADMIN_ROLE_PERMISSIONS_SAVE");

  const saved = useMemo(() => new Set((ticks.data ?? []).filter((p) => p.ticked && !p.locked).map((p) => p.permissionId)), [ticks.data]);
  const current = picked ?? saved;
  const changed = picked !== null && (picked.size !== saved.size || [...picked].some((id) => !saved.has(id)));

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const map = new Map();
    for (const p of ticks.data ?? []) {
      if (term && !`${p.serviceRequestId} ${p.controllerName} ${p.url}`.toLowerCase().includes(term)) continue;
      if (!map.has(p.controllerName)) map.set(p.controllerName, []);
      map.get(p.controllerName).push(p);
    }
    return [...map.entries()];
  }, [ticks.data, filter]);

  const toggle = (id) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setNotice("");
  };

  const toggleGroup = (items, on) => {
    const next = new Set(current);
    for (const p of items) if (!p.locked) (on ? next.add(p.permissionId) : next.delete(p.permissionId));
    setPicked(next);
    setNotice("");
  };

  const save = () =>
    action.run("save", async () => {
      const result = await saveRolePermissions(role.roleId, [...current]);
      ticks.setData(result);
      setPicked(null);
      setNotice("Saved. It applies to everyone with this role straight away.");
      onChanged();
    });

  const saveDetails = (e) => {
    e.preventDefault();
    action.run("details", async () => {
      await updateRole(role.roleId, details.name.trim(), details.description.trim());
      setNotice("Role details saved.");
      onChanged();
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete the ${role.name} role? This can't be undone.`)) return;
    action.run("delete", async () => {
      await deleteRole(role.roleId);
      onDeleted();
    });
  };

  const detailsChanged = details.name.trim() !== role.name || details.description.trim() !== (role.description ?? "");

  return (
    <div className="card">
      <h2>{role.name.toUpperCase()}</h2>
      {role.isBuiltIn && <p className="lead">Built in — its name is fixed, and it can't be deleted. Its description and ticks can change.</p>}

      {can("ADMIN_ROLE_UPDATE") && (
        <form onSubmit={saveDetails} className="toolbar">
          <input className="input" aria-label="Role name" value={details.name} disabled={role.isBuiltIn} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} />
          <input className="input grow" aria-label="Role description" placeholder="What it's for" value={details.description} onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))} />
          <button className="btn ghost small" disabled={!detailsChanged || !!action.busy}>
            Save details
          </button>
          {can("ADMIN_ROLE_DELETE") && !role.isBuiltIn && (
            <button type="button" className="btn ghost small" onClick={remove} disabled={!!action.busy}>
              Delete role
            </button>
          )}
        </form>
      )}

      <ErrorBanner message={ticks.error || action.error} />
      {notice && !action.error && <div className="notice">{notice}</div>}

      <input className="input grow" type="search" placeholder="Filter services" aria-label="Filter services" value={filter} onChange={(e) => setFilter(e.target.value)} />

      {ticks.loading && !ticks.data && <p className="empty">Loading…</p>}
      {groups.map(([controller, items]) => {
        const free = items.filter((p) => !p.locked);
        const allOn = free.length > 0 && free.every((p) => current.has(p.permissionId));
        return (
          <section className="group" key={controller}>
            <h3>
              {controller}
              {editable && free.length > 1 && (
                <button className="linklike" style={{ marginLeft: 10, padding: 0, fontSize: 12 }} onClick={() => toggleGroup(items, !allOn)}>
                  {allOn ? "untick all" : "tick all"}
                </button>
              )}
            </h3>
            {items.map((p) => {
              const ticked = p.locked ? p.ticked : current.has(p.permissionId);
              return (
                <label className="tick" key={p.permissionId}>
                  <input type="checkbox" checked={ticked} disabled={!!p.locked || !editable} onChange={() => toggle(p.permissionId)} />
                  <span>
                    <code>{p.serviceRequestId}</code>
                    {p.isAdminOnly && <span className="badge amber" style={{ marginLeft: 6 }}>Portal</span>}
                    {p.isDisabled && <span className="badge red" style={{ marginLeft: 6 }}>Switched off</span>}
                    {p.isObsolete && <span className="badge">Gone from the code</span>}
                    <span className="sub">
                      {p.httpMethod} {p.url}
                      {p.locked && ` · ${p.locked}`}
                    </span>
                  </span>
                </label>
              );
            })}
          </section>
        );
      })}

      {editable && (
        <div className="sticky-save">
          <button className="btn primary" disabled={!changed || !!action.busy} onClick={save}>
            {action.busy === "save" ? "Saving…" : "Save ticks"}
          </button>
          <button className="btn ghost" disabled={!changed || !!action.busy} onClick={() => setPicked(null)}>
            Undo changes
          </button>
          {changed && <span style={{ color: "var(--muted)" }}>Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
