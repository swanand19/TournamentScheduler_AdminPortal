import { useState } from "react";
import { getRoles, getUsers, resetUserPassword, setUserBlocked, setUserRole, signUserOut } from "../api/adminApi";
import { shortDate, useAction, useDebounced, useLoad } from "../hooks";
import { ErrorBanner, Pager } from "../ui";

// People: find them by name or email, filter by role, and act on one — block (signs them out at
// once), change role, sign out of every device, clear a forgotten portal password. The server
// refuses changing your own role or blocking yourself; the buttons follow.

const PAGE_SIZE = 20;

export default function Users({ can }) {
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const query = useDebounced(search);
  const list = useLoad(() => getUsers({ search: query, roleId: roleId ? Number(roleId) : undefined, page, pageSize: PAGE_SIZE }), [query, roleId, page]);
  const roles = useLoad(() => (can("ADMIN_ROLE_LIST") ? getRoles() : Promise.resolve([])), []);
  const action = useAction();

  // Each action answers with the person as they are now; swap them into the page.
  const act = (user, label, call, done) =>
    action.run(`${label}-${user.userId}`, async () => {
      const updated = await call();
      list.setData({ ...list.data, items: list.data.items.map((u) => (u.userId === updated.userId ? updated : u)) });
      setNotice(done(updated));
    });

  const block = (user) => {
    if (!user.isBlocked && !window.confirm(`Block ${user.name}?\n\nThey're signed out everywhere at once and can't sign in again until unblocked.`)) return;
    act(user, "block", () => setUserBlocked(user.userId, !user.isBlocked), (u) => `${u.name} is ${u.isBlocked ? "blocked" : "unblocked"}.`);
  };

  const changeRole = (user, next) => {
    const role = roles.data?.find((r) => r.roleId === next);
    if (!window.confirm(`Make ${user.name} ${role?.name ?? "that role"}?`)) return;
    act(user, "role", () => setUserRole(user.userId, next), (u) => `${u.name} is now ${u.roleName}.`);
  };

  const signOutEverywhere = (user) => {
    if (!window.confirm(`Sign ${user.name} out on every device? They'll need a new code to sign in.`)) return;
    act(user, "out", () => signUserOut(user.userId), (u) => `${u.name} is signed out everywhere.`);
  };

  const resetPassword = (user) => {
    if (!window.confirm(`Clear ${user.name}'s portal password?\n\nTheir portal session ends, and at their next portal sign-in they choose a new one.`)) return;
    act(user, "reset", () => resetUserPassword(user.userId), (u) => `${u.name}'s portal password is cleared.`);
  };

  const data = list.data;
  return (
    <div className="card">
      <div className="toolbar">
        <input
          className="input grow"
          type="search"
          placeholder="Search by name or email"
          aria-label="Search people by name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {roles.data?.length > 0 && (
          <select
            className="select"
            aria-label="Role"
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Every role</option>
            {roles.data.map((r) => (
              <option key={r.roleId} value={r.roleId}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ErrorBanner message={list.error || action.error} />
      {notice && !action.error && <div className="notice">{notice}</div>}

      {list.loading && !data && <p className="empty">Loading…</p>}
      {data && data.items.length === 0 && <p className="empty">{query ? "Nobody matches that." : "Nobody yet."}</p>}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Last sign-in</th>
                <th>Devices</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => {
                const busy = action.busy.endsWith(`-${u.userId}`);
                return (
                  <tr key={u.userId}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.isMe && <span className="badge amber" style={{ marginLeft: 6 }}>You</span>}
                      {u.isBlocked && <span className="badge red" style={{ marginLeft: 6 }}>Blocked</span>}
                      <span className="sub">{u.email}</span>
                    </td>
                    <td>
                      {can("ADMIN_USER_SET_ROLE") && roles.data?.length > 0 && !u.isMe ? (
                        <select
                          className="select"
                          aria-label={`Role of ${u.name}`}
                          value={u.roleId}
                          disabled={busy}
                          onChange={(e) => changeRole(u, Number(e.target.value))}
                        >
                          {roles.data.map((r) => (
                            <option key={r.roleId} value={r.roleId}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.roleName
                      )}
                      {u.hasPassword && <span className="sub">Has a portal password</span>}
                    </td>
                    <td>{shortDate(u.memberSince)}</td>
                    <td>{u.lastLoginAt ? shortDate(u.lastLoginAt) : "—"}</td>
                    <td>{u.activeSessions}</td>
                    <td className="actions">
                      {can("ADMIN_USER_SET_BLOCKED") && !u.isMe && (
                        <button className={`btn small ${u.isBlocked ? "ghost" : "danger"}`} disabled={busy} onClick={() => block(u)}>
                          {u.isBlocked ? "Unblock" : "Block"}
                        </button>
                      )}
                      {can("ADMIN_USER_SIGN_OUT") && u.activeSessions > 0 && (
                        <button className="btn ghost small" disabled={busy} onClick={() => signOutEverywhere(u)}>
                          Sign out
                        </button>
                      )}
                      {can("ADMIN_USER_RESET_PASSWORD") && u.hasPassword && (
                        <button className="btn ghost small" disabled={busy} onClick={() => resetPassword(u)}>
                          Reset password
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

      {data && data.total > 0 && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
