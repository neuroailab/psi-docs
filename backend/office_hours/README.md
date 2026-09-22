# SNAIL office-hours backend

Lightweight FastAPI + SQLite service for the static SNAIL site. Google and Microsoft
are independent adapters; normal visitors use Stanford identity only, while hosts
can consent to their own calendars. Start with [SETUP.md](SETUP.md).

## Run / test locally

Python **3.10+** for the app/tests; production/backup script uses **3.11+**.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest tests -q
```

The production entry point is `uvicorn app:create_app --factory`. Configure
`DATABASE_PATH`, `TOKEN_ENCRYPTION_KEY` (a persistent Fernet key), `SITE_URL`,
`SITE_ORIGIN`, and the four OAuth client variables in a private environment file.
Never use live host calendars for automated tests. There is deliberately no
production demo login or fake-availability switch.

## Operational properties

- Monday/Tuesday/Thursday/Friday, noon–2pm, `America/Los_Angeles`, DST-aware.
- 30/60-minute meetings, starts every half hour, 30-minute lead, 28-day horizon.
- SQLite `BEGIN IMMEDIATE` reserves overlapping hosts atomically; user-scoped
  request keys make repeated submits idempotent. Four upcoming bookings per user.
- Availability is read directly from providers; the UI refreshes every 30 seconds
  while visible. A new booking rechecks busy intervals. Provider outages close
  availability. Titles/details of unrelated calendar events aren't stored.
- One worker serializes provider writes; SQLite WAL is persistent. Do not deploy
  multiple workers/VMs against this SQLite file. Migrate to a shared database and
  distributed work queue before horizontal scaling.
- Write-ahead `pending` and `cancelling` states survive restart; retry every minute.
  Google deterministic event IDs and Microsoft transaction IDs + extended-property
  lookup recover an event written before a lost response. Cancellation keeps the
  reservation until all host events are deleted. A partial operation is never
  falsely shown as confirmed/cancelled.
- Google invites the guest from the first host; Microsoft sends its normal meeting
  invitation. For a both-host meeting the second host receives a direct calendar
  hold, not a second invitation to the guest. It is not a shared editable event;
  make booking changes through this site.
- Cross-provider writes and outside calendar edits cannot be truly atomic. Hosts
  must resolve a later conflict with an already confirmed meeting manually. The
  service does not automatically move/cancel confirmed reservations based on edits
  made in Google/Outlook. Pending outages and secret expiry need operator attention.
- OAuth state is one-time, expires in 10 minutes, bound to a tab, with PKCE + nonce
  and verified signed ID tokens. Microsoft visitor sign-in checks Stanford tenant
  and member status; Google checks verified `@stanford.edu` email. No email form
  can grant a session or host privileges.
- API session tokens are random, hashed in SQLite, expire in 12 hours, and live
  only in the frontend tab's sessionStorage. No third-party-cookie dependency.
  Provider refresh tokens are encrypted. HTTPS/CORS are restricted to the Pages
  origin, request sizes and per-IP rates are bounded, and provider secrets are
  absent from public endpoints/logs.
- No Slack integration or mail service in this version. Invitations use calendar
  providers, not SMTP. The service can share its VM with future lightweight APIs.

## Deployment / maintenance

Only `snail-services` is in scope for `deploy/install.sh`; it refuses other hosts.
Upload explicit app files + `deploy/` (not .venv, tests, or secrets), SSH over IAP,
then run the installer from that upload directory. Backend source is versioned
but excluded from the GitHub Pages artifact. The static site needs only the API
address in `snail/office-hours/config.js`.

Systemd services:

```bash
sudo systemctl status snail-office-hours caddy
sudo systemctl restart snail-office-hours
sudo journalctl -u snail-office-hours --since '1 hour ago'
sudo systemctl list-timers snail-backup.timer
```

The API listens only on `127.0.0.1:8081` behind Caddy. SSH has no internet-wide
firewall rule. The VM has no attached service account/GCP API scope. Code is
root-owned; the service runs as unprivileged `snail`. Secrets are root-only at
`/etc/snail/office-hours.env`. Data is mode 0700 at `/var/lib/snail`.

`snail-backup.timer` makes encrypted consistent SQLite snapshots daily, retains
14 days, and does not copy plaintext tokens. These backups share the VM disk:
**they are not disaster recovery**. Arrange a separate protected off-VM copy
of both encrypted snapshots and the encryption key before relying on bookings.
Never regenerate the key while retaining encrypted connections. Retaining the
boot disk protects it from accidental VM deletion, not project/disk deletion.

The small VM has limited memory. Monitor `free -m`, disk usage, and failed systemd
units, and review dependency/OS security updates. Do not add memory-heavy services
or automatically scale resources without revisiting the monthly budget.
