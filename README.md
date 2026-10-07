# Tournament Scheduler — admin portal

Phase 5 of `docs/accounts-and-access-plan.md`. Admins (and any role ticked for portal services)
manage every tournament, people, roles and permissions here. Details: `TournamentScheduler.Api/Auth/README.md`
("The admin portal").

## Run

```bash
npm install
npm run dev        # http://localhost:5174
```

`.env` is the web app's: `VITE_API_BASE_URL` (the API, ending in `/api`), `VITE_GATEWAY_KEY_ID`,
`VITE_GATEWAY_PUBLIC_KEY` (`dotnet run -- gateway-keys show` in the API folder).

## Signing in

1. Your account needs a role with portal access — the first admin: `dotnet run -- users create-admin <email> <name>`.
2. Enter your email, then the emailed code (in Development the code is in the API's console).
3. The first time, choose a password (at least 10 characters). After that: code + password.

Forgot the password? Another admin clears it under People → Reset password, or on the server:
`dotnet run -- users reset-password <email>`.

## Checks

```bash
npm run lint
npm run build            # static files in dist/ — any static host works
npm run verify:gateway   # the crypto still matches the shared vectors
```
