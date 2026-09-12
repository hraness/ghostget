# Set up Ghostget with your agent

Ask your agent to run:

```sh
ghostget setup --json
```

The result reports whether the native app is available, the number of configured
accounts, common services, pending setup suggestions and the next step. It does
not verify current logins. If the app is closed, the command returns guidance
without creating local state or opening anything.

An agent can suggest a service for you to review:

```sh
ghostget setup request linkedin-web --json
ghostget setup status --json
ghostget setup cancel <request-id> --json
```

Suggestions appear in Accounts while the app is open. Review selects the service;
you still choose whether to open sign-in, verify the account and connect it.
Saving a reviewed browser connection clears its exact suggestion. Dismiss removes
a suggestion without changing any account. A suggestion
expires after ten minutes or when the app closes. Repeating the same pending
service request returns the existing suggestion without extending its lifetime.

Setup commands cannot choose a browser profile, scan local browsers, connect an
account, enable permissions or approve an operation. The app remains the place
for those decisions. Configured accounts still require explicit selection and
the permissions applicable to each operation.

## Common services

Gmail, GitHub, LinkedIn, X, Instagram, Reddit and WhatsApp appear first. LinkedIn,
X and Reddit have native browser sign-in verification. The other services provide
instructions for their existing supported setup flows; they do not gain new
native connection support from being listed here. Installed capabilities remain
authoritative.

## Optional browser hints

Browser discovery is off initially. Enable it in Accounts if you want Ghostget
to find Chrome's `Default` and numbered profiles and suggest possible saved
sessions for LinkedIn, X and Reddit. You can turn it off while a scan is running.
Your choice is stored privately; discovered hints remain in memory for at most
five minutes and clear on disable or app exit. A previously enabled app can
refresh once at startup. Ordinary status and approval polling never scan.

The scanner reads a bounded snapshot of the Chrome cookie database into memory
and queries only fixed cookie names, domains and expiry metadata. It does not
decrypt cookies, select their values or expose database contents to the agent.
It writes no copy of the database to disk and does not ask Keychain for browser
keys. A separate watchdog bounds the scan and stops it if the app disconnects.

Busy, changing, oversized, unsafe or unsupported databases leave session hints
unavailable. Missing hints do not mean you are signed out. A cookie can remain
after its server session expires, so every connection still requires the normal
live account verification and your final review. Discovery does not support
Safari, other Chromium browsers, automatic password entry or passkeys.
