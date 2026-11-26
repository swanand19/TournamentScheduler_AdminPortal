import { useMemo, useRef, useState } from "react";
import { getTemplates, resetTemplate, saveTemplate } from "../api/adminApi";
import { shortDate, useAction, useLoad } from "../hooks";
import { ErrorBanner, Loading } from "../ui";

// The wording of every message the system sends (phase 6D): sign-in and other codes, invites, and
// the notifications. Each channel has its switch and its texts; {{Placeholders}} are filled in when
// a message goes out (click one to put it where the cursor is). The server checks every save —
// codes can't lose {{Code}}, codes and invites can't stop going by email or to the number — and says why.
//
// Codes and invites to a mobile number (2026-11-26): "Mobile number" holds the approved WhatsApp
// template the message goes out as (its wording lives at Meta; here only its name, language and which
// values fill {{1}}, {{2}}, …) and, folded away, the words the log writes when a server's numbers are
// for testing. The server says which of the two this server uses.

const FIELDS = ["isEmail", "emailSubject", "emailBody", "isSms", "smsBody", "smsDltTemplateId", "whatsAppTemplateName", "whatsAppLanguage", "isNotification", "notificationTitle", "notificationBody", "isPush", "pushTitle", "pushBody"];

const CHANNELS = [
  {
    key: "Notification",
    label: "Inbox",
    on: "isNotification",
    texts: [
      { field: "notificationTitle", label: "Title" },
      { field: "notificationBody", label: "Text", rows: 3 },
    ],
  },
  {
    key: "Email",
    label: "Email",
    on: "isEmail",
    texts: [
      { field: "emailSubject", label: "Subject" },
      { field: "emailBody", label: "Body", rows: 8 },
    ],
  },
  {
    key: "Sms",
    label: "Mobile number",
    on: "isSms",
    texts: [
      { field: "smsBody", label: "Text", rows: 3 },
      { field: "smsDltTemplateId", label: "DLT template id", plain: true, hint: "From India's DLT registry. Once texts are sent for real, the wording must match what was registered." },
    ],
  },
  {
    key: "Push",
    label: "Push",
    on: "isPush",
    texts: [
      { field: "pushTitle", label: "Title", placeholder: "Same as the inbox" },
      { field: "pushBody", label: "Text", rows: 2, placeholder: "Same as the inbox" },
    ],
  },
];

const pick = (t) => ({
  ...Object.fromEntries(FIELDS.map((f) => [f, t[f] ?? (f.startsWith("is") ? false : "")])),
  whatsAppParameters: [...(t.whatsAppParameters ?? [])],
});

const sameDraft = (a, b) =>
  FIELDS.every((f) => (a[f] ?? "") === (b[f] ?? "")) && a.whatsAppParameters.join(",") === b.whatsAppParameters.join(",");

/** Fills placeholders with the samples, for the preview. */
const fill = (text, placeholders) =>
  (text ?? "").replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (m, name) => placeholders.find((p) => p.name === name)?.sample ?? m);

export default function Templates({ can }) {
  const templates = useLoad(getTemplates, []);
  const [selected, setSelected] = useState(null);

  const template = templates.data?.find((t) => t.code === selected) ?? templates.data?.[0];
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of templates.data ?? []) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group).push(t);
    }
    return [...map.entries()];
  }, [templates.data]);

  const replace = (saved) => templates.setData(templates.data.map((t) => (t.code === saved.code ? saved : t)));

  return (
    <div className="layout-2">
      <aside className="squad">
        <h2>Messages</h2>
        <p className="lead">Everything the system sends, by what it's for. Pick one to change its words.</p>
        <ErrorBanner message={templates.error} />
        {templates.loading && !templates.data && <Loading rows={3} />}
        {groups.map(([group, items]) => (
          <div key={group} className="template-group">
            <h3>{group}</h3>
            <ul className="role-list">
              {items.map((t) => (
                <li key={t.code}>
                  <button aria-current={t.code === template?.code} onClick={() => setSelected(t.code)}>
                    <span className="shirt" aria-hidden="true">
                      {t.isEmail && t.isNotification ? "✉•" : t.isEmail ? "✉" : t.isNotification ? "•" : "–"}
                    </span>
                    <span>
                      <span className="name">{t.name}</span>
                      <span className="sub">{channelsOn(t)}</span>
                    </span>
                    {t.isCustomised && <span className="badge amber">Edited</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      {template && <TemplateEditor key={template.code} template={template} editable={can("ADMIN_TEMPLATE_SAVE")} canReset={can("ADMIN_TEMPLATE_RESET")} onSaved={replace} />}
    </div>
  );
}

function channelsOn(t) {
  const on = CHANNELS.filter((c) => c.key !== "Sms" && t[c.on] && t.channels.find((x) => x.channel === c.key)?.supported).map((c) => c.label);
  if (t.channels.find((x) => x.channel === "WhatsApp")?.supported) on.push(t.whatsAppTemplateName ? "WhatsApp" : "No WhatsApp template");
  return on.length ? on.join(" · ") : "Switched off";
}

function TemplateEditor({ template, editable, canReset, onSaved }) {
  const [draft, setDraft] = useState(() => pick(template));
  const [notice, setNotice] = useState("");
  const focused = useRef({ field: null, el: null });
  const action = useAction();

  const changed = !sameDraft(draft, pick(template));
  const channels = CHANNELS.map((c) => ({ ...c, info: template.channels.find((x) => x.channel === c.key) })).filter((c) => c.info?.supported);

  const set = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setNotice("");
  };

  // Puts {{Name}} where the cursor is in the text box last used (or at the end of it).
  const insert = (name) => {
    const { field, el } = focused.current;
    if (!field || !el) return;
    const token = `{{${name}}}`;
    const value = draft[field] ?? "";
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    set(field, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () =>
    action.run("save", async () => {
      const result = await saveTemplate(template.code, draft);
      onSaved(result);
      setDraft(pick(result));
      setNotice("Saved. Messages from now on use these words.");
    });

  const reset = () => {
    if (!window.confirm(`Put "${template.name}" back to the built-in wording? Your changes to it are lost.`)) return;
    action.run("reset", async () => {
      const result = await resetTemplate(template.code);
      onSaved(result);
      setDraft(pick(result));
      setNotice("Back to the built-in wording.");
    });
  };

  return (
    <div className="card">
      <div className="editor-head">
        <span className="crest" aria-hidden="true">
          {template.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{template.name}</h2>
          <p className="lead">{template.description}</p>
        </div>
      </div>
      {template.isCustomised && (
        <p className="template-meta">
          Edited{template.changedBy ? ` by ${template.changedBy}` : ""}
          {template.changedAt ? ` on ${shortDate(template.changedAt)}` : ""}. <code>{template.code}</code>
        </p>
      )}

      <ErrorBanner message={action.error} />
      {notice && !action.error && <div className="notice">{notice}</div>}

      <section className="group">
        <h3>Placeholders</h3>
        <p className="template-hint">Filled in when the message goes out. Click one to put it where your cursor is.</p>
        <div className="chips">
          {template.placeholders.map((p) => (
            <button key={p.name} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p.name)} disabled={!editable} title={p.description}>
              {`{{${p.name}}}`}
              {p.required && <span className="req"> required</span>}
              <span className="sub">{p.description}</span>
            </button>
          ))}
        </div>
      </section>

      {channels.map((c) => {
        if (c.key === "Sms")
          return <MobileNumber key={c.key} template={template} sms={c} draft={draft} set={set} editable={editable} focusedRef={focused} />;
        const on = !!draft[c.on];
        return (
          <section className="group" key={c.key}>
            <h3>
              {c.label}
              <button
                type="button"
                className="switch neutral"
                role="switch"
                aria-checked={on}
                aria-label={`${c.label} ${on ? "on" : "off"}`}
                disabled={!editable || c.info.locked || !!action.busy}
                onClick={() => set(c.on, !on)}
                style={{ marginLeft: "auto" }}
              >
                <span className="track" aria-hidden="true" />
                <span className="label">{on ? "On" : "Off"}</span>
              </button>
            </h3>
            {c.info.note && <p className="template-hint">{c.info.locked ? "🔒 " : ""}{c.info.note}</p>}
            {on && (
              <div className="template-fields">
                {c.texts.map((t) => (
                  <label key={t.field} className="field">
                    <span>{t.label}</span>
                    {t.rows ? (
                      <textarea
                        className="input"
                        rows={t.rows}
                        value={draft[t.field] ?? ""}
                        placeholder={t.placeholder}
                        disabled={!editable}
                        onFocus={(e) => (focused.current = { field: t.field, el: e.target })}
                        onChange={(e) => set(t.field, e.target.value)}
                      />
                    ) : (
                      <input
                        className="input"
                        value={draft[t.field] ?? ""}
                        placeholder={t.placeholder}
                        disabled={!editable}
                        onFocus={(e) => (focused.current = t.plain ? { field: null, el: null } : { field: t.field, el: e.target })}
                        onChange={(e) => set(t.field, e.target.value)}
                      />
                    )}
                    {t.hint && <span className="template-hint">{t.hint}</span>}
                  </label>
                ))}
                {!onlyPlain(c) && <Preview channel={c} draft={draft} placeholders={template.placeholders} />}
              </div>
            )}
          </section>
        );
      })}

      {editable && (
        <div className="sticky-save">
          <span className={`state${changed ? " dirty" : ""}`}>{changed ? "Unsaved changes" : "All saved"}</span>
          <button className="btn primary" disabled={!changed || !!action.busy} onClick={save}>
            {action.busy === "save" ? "Saving…" : "Save"}
          </button>
          <button className="btn ghost" disabled={!changed || !!action.busy} onClick={() => setDraft(pick(template))}>
            Undo changes
          </button>
          {canReset && template.isCustomised && (
            <button className="btn ghost" disabled={!!action.busy} onClick={reset}>
              {action.busy === "reset" ? "Resetting…" : "Reset to built-in"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const onlyPlain = (c) => c.texts.every((t) => t.plain);

/**
 * Codes and invites to a mobile number: the WhatsApp template they go out as, and the words the log
 * writes instead when this server's numbers are for testing (folded away unless that's what it uses).
 */
function MobileNumber({ template, sms, draft, set, editable, focusedRef }) {
  const whatsApp = template.channels.find((x) => x.channel === "WhatsApp");
  const fixedValues = !!whatsApp?.locked; // a code: the template takes just the code
  const way = whatsApp?.inUseHere ? "get WhatsApp messages" : sms.info.inUseHere ? "go to the log (testing)" : "are switched off";
  const plain = { onFocus: () => (focusedRef.current = { field: null, el: null }) };

  return (
    <section className="group">
      <h3>Mobile number</h3>
      <p className="template-hint">Goes to the mobile number when that's what the person gave. On this server, numbers {way}.</p>

      {whatsApp?.supported && (
        <div className="number-way">
          <div className="number-way-head">
            <strong>WhatsApp</strong>
            <span className={`badge${whatsApp.inUseHere ? " green" : ""}`}>{whatsApp.inUseHere ? "In use on this server" : "Not used on this server"}</span>
          </div>
          {whatsApp.note && <p className="template-hint">{whatsApp.locked ? "🔒 " : ""}{whatsApp.note}</p>}
          <div className="wa-grid">
            <label className="field">
              <span>Template name</span>
              <input
                className="input mono"
                value={draft.whatsAppTemplateName}
                placeholder={fixedValues ? "otp_template_kickcricket" : "e.g. tournament_invite — empty: not sent on WhatsApp"}
                spellCheck={false}
                autoCapitalize="none"
                disabled={!editable}
                {...plain}
                onChange={(e) => set("whatsAppTemplateName", e.target.value)}
              />
              <span className="template-hint">Exactly as approved in WhatsApp Manager. Its wording lives at Meta.</span>
            </label>
            <label className="field">
              <span>Language</span>
              <input
                className="input mono"
                value={draft.whatsAppLanguage}
                placeholder="en"
                spellCheck={false}
                autoCapitalize="none"
                disabled={!editable}
                {...plain}
                onChange={(e) => set("whatsAppLanguage", e.target.value)}
              />
              <span className="template-hint">en isn't en_US.</span>
            </label>
          </div>
          {fixedValues ? (
            <p className="template-hint">
              The code fills <code>{"{{1}}"}</code> and the template's Copy code button.
            </p>
          ) : (
            <WhatsAppValues values={draft.whatsAppParameters} placeholders={template.placeholders} editable={editable} onChange={(v) => set("whatsAppParameters", v)} />
          )}
        </div>
      )}

      <details className="number-way" open={!!sms.info.inUseHere}>
        <summary>
          <strong>Text wording</strong>
          <span className={`badge${sms.info.inUseHere ? " green" : ""}`}>{sms.info.inUseHere ? "In use on this server" : "Testing only"}</span>
        </summary>
        {sms.info.note && <p className="template-hint">{sms.info.note}</p>}
        <div className="template-fields">
          {sms.texts.map((t) =>
            t.rows ? (
              <label key={t.field} className="field">
                <span>{t.label}</span>
                <textarea
                  className="input"
                  rows={t.rows}
                  value={draft[t.field] ?? ""}
                  disabled={!editable}
                  onFocus={(e) => (focusedRef.current = { field: t.field, el: e.target })}
                  onChange={(e) => set(t.field, e.target.value)}
                />
              </label>
            ) : (
              <label key={t.field} className="field">
                <span>{t.label}</span>
                <input className="input" value={draft[t.field] ?? ""} disabled={!editable} {...plain} onChange={(e) => set(t.field, e.target.value)} />
                {t.hint && <span className="template-hint">{t.hint}</span>}
              </label>
            )
          )}
          <Preview channel={sms} draft={draft} placeholders={template.placeholders} />
        </div>
      </details>
    </section>
  );
}

/** Which of the message's values fill the WhatsApp template's {{1}}, {{2}}, …, in order. */
function WhatsAppValues({ values, placeholders, editable, onChange }) {
  const sample = (name) => placeholders.find((p) => p.name === name)?.sample ?? name;
  const add = () => onChange([...values, placeholders.find((p) => !values.includes(p.name))?.name ?? placeholders[0].name]);

  return (
    <div className="wa-values">
      <span className="template-hint">
        Fill the template's variables, in the order they appear in it. Each must match what the approved template expects.
      </span>
      {values.length === 0 && <span className="template-hint">No values: the template has no variables.</span>}
      {values.map((v, i) => (
        <div className="wa-value" key={i}>
          <code>{`{{${i + 1}}}`}</code>
          <select
            className="input"
            value={v}
            disabled={!editable}
            aria-label={`Value for {{${i + 1}}}`}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          >
            {placeholders.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.description}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost small" disabled={!editable} onClick={() => onChange(values.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {editable && (
        <button type="button" className="btn ghost small wa-add" onClick={add}>
          + Add a value
        </button>
      )}
      {values.length > 0 && (
        <div className="preview">
          <span className="preview-label">Sample</span>
          <p>{values.map((v, i) => `{{${i + 1}}} ${sample(v)}`).join("  ·  ")}</p>
        </div>
      )}
    </div>
  );
}

/** The message as someone would get it, with sample values. */
function Preview({ channel, draft, placeholders }) {
  const [title, body] = channel.texts.filter((t) => !t.plain).map((t) => draft[t.field]);
  const inboxTitle = draft.notificationTitle;
  const inboxBody = draft.notificationBody;
  const shownTitle = channel.key === "Push" ? title || inboxTitle : title;
  const shownBody = channel.key === "Push" ? body || inboxBody : channel.key === "Sms" ? title : body;
  return (
    <div className={`preview ${channel.key.toLowerCase()}`} aria-label={`${channel.label} preview`}>
      <span className="preview-label">Preview</span>
      {channel.key !== "Sms" && <strong>{fill(shownTitle, placeholders)}</strong>}
      <p>{fill(shownBody, placeholders)}</p>
    </div>
  );
}
