import { useState } from "react";
import { sendCode, signIn } from "../api/adminApi";
import { useAction } from "../hooks";
import { ErrorBanner } from "../ui";
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
        ? "First time in the portal: choose a password (at least 10 characters). You'll need it with a code each time."
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

  return (
    <main className="signin">
      <p className="brand" style={{ marginBottom: 18 }}>
        <small>TOURNAMENT SCHEDULER</small>ADMIN PORTAL
      </p>
      <div className="card">
        {reason && step === "email" && <div className="notice">{reason}</div>}
        <ErrorBanner message={action.error} />
        {hint && <p className="hint">{hint}</p>}

        {step === "email" ? (
          <form onSubmit={askForCode}>
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn primary" disabled={!email.trim() || !!action.busy}>
              {action.busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="code">Code from the email</label>
            <input
              id="code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={step !== "code"}
              required
            />
            {(step === "password" || step === "newPassword") && (
              <>
                <label htmlFor="password">{step === "newPassword" ? "Choose a password" : "Password"}</label>
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
              {action.busy ? "Checking…" : step === "code" ? "Continue" : "Sign in"}
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
