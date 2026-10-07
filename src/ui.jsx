// Small shared components: the error line and the pager.

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
      <span>
        {from}–{to} of {total}
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
