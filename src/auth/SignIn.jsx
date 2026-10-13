import { useState } from "react";
import { sendCode, signIn } from "../api/adminApi";
import { useAction } from "../hooks";
import { ErrorBanner, Scorebug } from "../ui";
import { getSignedOutReason, setSession } from "./session";

// Signing in to the portal: email → the emailed code → the password (or, the first time, a new
// one). The server decides each step; this screen just asks for what it says is next.

export default function SignIn() {
  const [step, setStep] = useState("email"); // email | code | password | newPassword
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [hint, setHint] = useState("");
  const action = useAction();
  const reason = getSignedOutReason();

  const askForCode = (e) => {
    e.preventDefault();
    action.run("send", async () => {
      const sent = await sendCode(email.trim());
      setEmail(sent.email);
      setHint(`We've emailed a code to ${sent.email}. It works for ${Math.round(sent.expiresInSeconds / 60)} minutes.`);
      setStep("code");
    });
  };

  const finish = (answer) => {
    if (answer.outcome === "SignedIn") {
      setSession({ token: answer.sessionToken, sessionId: answer.sessionId, expiresAt: answer.expiresAt, user: answer.me });
      return;
    }
    setStep(answer.outcome === "NeedsNewPassword" ? "newPassword" : "password");
    setHint(
      answer.outcome === "NeedsNewPassword"
        ? "First time in the portal. You'll use this password with an emailed code each time."
        : ""
    );
  };

  const submit = (e) => {
    e.preventDefault();
    if (step === "newPassword" && password !== again) {
      action.setError("The two passwords don't match.");
      return;
    }
    action.run("sign-in", async () => {
      const answer = await signIn(email, code.trim(), step === "newPassword" ? { newPassword: password } : { password: step === "password" ? password : "" });
      finish(answer);
    });
  };

  const restart = () => {
    setStep("email");
    setCode("");
    setPassword("");
    setAgain("");
    setHint("");
    action.setError("");
  };

  const stage = step === "email" ? 0 : step === "code" ? 1 : 2;
  const STEPS = ["Email", "Code", "Password"];
  const TITLES = { email: "Show your pass", code: "Check your email", password: "One more thing", newPassword: "Pick a password" };

  return (
    <main className={`signin${step === "email" ? "" : " past-email"}`}>
      <section className="poster">
        <Scorebug />
        <h1>
          Run the
          <br />
          <em>whole</em>
          <br />
          season<span>.</span>
        </h1>
        <p>Tournaments, people, roles and every switch behind them — managed from one touchline.</p>
        <svg viewBox="0 0 420 240" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <rect className="draw" pathLength="1" x="4" y="4" width="412" height="232" rx="3" />
          <path className="draw" pathLength="1" d="M210 4v232" />
          <circle className="draw" pathLength="1" cx="210" cy="120" r="44" />
          <path className="draw" pathLength="1" d="M4 60h64v120H4M416 60h-64v120h64" />
          <circle className="ball" cx="300" cy="86" r="7" stroke="none" />
        </svg>
      </section>

      <div className="gate">
        <div className="gate-top">
          <span>
            Admit <b>one</b>
          </span>
          <span>Staff entrance</span>
        </div>

        <ol className="steps" aria-label="Sign-in steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i < stage ? "done" : i === stage ? "now" : undefined} aria-current={i === stage ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>

        <h2>{TITLES[step]}</h2>
        {reason && step === "email" && <div className="notice">{reason}</div>}
        <ErrorBanner message={action.error} />
        {hint ? <p className="hint">{hint}</p> : step === "email" && <p className="hint">We'll email you a six-digit code.</p>}

        {step === "email" ? (
          <form onSubmit={askForCode}>
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="username" placeholder="you@club.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn primary" disabled={!email.trim() || !!action.busy}>
              {action.busy ? "Sending…" : "Send code →"}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            {step === "code" ? (
              <>
                <label htmlFor="code">Code from the email</label>
                <div className="otp">
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                    required
                  />
                  <div className="cells" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} className={i === code.length ? "cursor" : code.length === 6 && i === 5 ? "full" : undefined}>
                        {code[i] ?? ""}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              // The server has checked the code by now, so it shrinks to one line and leaves the room to the password.
              <div className="code-ok" aria-label={`Code ${code} accepted`}>
                <span>Code</span>
                <b>{code}</b>
                <span className="ok">Accepted ✓</span>
              </div>
            )}
            {(step === "password" || step === "newPassword") && (
              <>
                <label htmlFor="password">{step === "newPassword" ? "Choose a password · 10+ characters" : "Password"}</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete={step === "newPassword" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </>
            )}
            {step === "newPassword" && (
              <>
                <label htmlFor="again">Type it again</label>
                <input id="again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
              </>
            )}
            <button className="btn primary" disabled={code.length !== 6 || !!action.busy}>
              {action.busy ? "Checking…" : step === "code" ? "Continue →" : "Sign in →"}
            </button>
            <button type="button" className="linklike" onClick={restart}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
