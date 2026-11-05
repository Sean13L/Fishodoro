# Security

## Model

- **The database has no client access.** It's a Turso database reached only by the server with a secret token, so there are no row-level security policies or rules to misconfigure. Every query uses `user.id` from the session, and all SQL is parameterized.
- **Routes are private by default.** A route only skips the session check if it's wrapped in `open()`. Unknown routes return 404.
- **The server decides catches.** It checks elapsed time and rolls the fish, and the request body has no influence on either. Guest fish are local only and can't be imported.

## Sessions and browser

- 256-bit random token in a `__Host-` HttpOnly, Secure, SameSite=Strict cookie, stored only as a SHA-256 hash, for 30 days at most. Nothing sensitive goes in localStorage.
- Password resets end all sessions. Password changes and turning on 2FA end all other sessions.
- Writes also require a matching `Origin` and a JSON content type.
- CSP is `default-src 'none'` with same-origin allowances only: no inline scripts or styles, no third-party origins. User-facing values reach the DOM as text, never as HTML.

## Credentials

- Argon2id (19 MiB, 2 passes), at least 12 characters, a common-password check and no composition rules.
- Optional TOTP 2FA, with the secret AES-256-GCM encrypted, replay blocked, and 8 hashed single-use recovery codes.
- Sliding-window rate limits per IP and per account on login, signup, verify, reset and re-authentication. The count and insert are one SQL statement, so parallel requests can't slip past, even across server instances. Keys are HMACs, so raw IPs and emails aren't stored.
- Uniform errors, equal hashing work and unawaited email sends, so responses don't reveal which emails have accounts.
- Verification requires the account's password, which blocks pre-hijacking. Sign-up, reset and verify tokens are single-use, hashed, and expire after 30 minutes. They travel in the URL fragment.

## Third parties

| Party | Used for | Receives |
|---|---|---|
| `qrcode-generator` (npm, server only) | Drawing the 2FA QR code | The 2FA setup URI, in-process |
| Brevo | Security emails | Email address, message |
| Vercel | Running the app | Web requests |
| Turso | Database | Database contents |
| `@libsql/client`, `@vercel/functions` (npm, server only) | Database access, background email | Queries, in-process |
| Pixelify Sans, Silkscreen | Fonts, self-hosted under the OFL | Nothing: no external requests |

The browser loads no third-party scripts, styles, fonts or images.

## Known limits

- A guest can edit their own browser storage and invent guest fish. Those never reach the server or an account.
- Attempt records can last up to two days, because the free Vercel plan runs the purge once a day.
- Turso's free plan keeps only one day of restore history, so a serious data loss older than that can't be undone.

## Reporting a vulnerability

Email the contact address shown in the site footer.
