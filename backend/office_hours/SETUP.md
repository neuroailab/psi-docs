# Finish connecting Google and Outlook

The website and HTTPS service can run before credentials are added, but **no
bookings are offered until a host authorizes a calendar and chooses calendars**.
The app never uses the operator's gcloud credentials to read personal calendars.

## Addresses to copy

- App/homepage: `https://neuroailab.github.io/psi-docs/snail/office-hours/`
- Privacy/terms: `https://neuroailab.github.io/psi-docs/snail/office-hours/privacy.html`
- **Redirect/callback (both providers, exactly):**
  `https://neuroailab.github.io/psi-docs/snail/office-hours/callback.html`
- API: `https://snail-api.35.206.117.162.sslip.io`

The callback is on GitHub Pages. It immediately removes the authorization code
from the address bar, verifies this tab's state, and forwards the code to the
backend. Only the backend holds the client secret and PKCE verifier. No provider
tokens appear in the frontend. Do not change the redirect to the raw IP address.

## 1. Google

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=tpucloud-196821)
   in project **tpucloud-196821**. Configure a new app named **SNAIL Office Hours**.
   Preserve any existing project-wide consent configuration; if other applications
   already use it, coordinate changes rather than replacing their branding/scopes.
2. Configure branding with the homepage and privacy URLs above. Use
   `klemenk@stanford.edu` as support/developer contact. Follow Google's domain
   ownership verification if requested; the callback domain is
   `neuroailab.github.io`, not the backend's sslip.io domain.
3. Choose **Internal** only if this project belongs to the appropriate Stanford
   organization and all intended accounts are eligible. Otherwise use **External**.
   Testing mode is fine for an initial consent test, but external Calendar refresh
   tokens normally expire after **seven days** in Testing. Move to **In production**
   for ongoing use, complete required verification, and follow any Stanford app
   approval policy. Do not bypass consent warnings or university restrictions.
4. The **Google Calendar API** has been enabled in this project. If you use a
   different project for the OAuth client, enable the API there too.
5. Add these data-access scopes:

   ```text
   openid
   email
   profile
   https://www.googleapis.com/auth/calendar.events.owned
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   https://www.googleapis.com/auth/calendar.events.freebusy
   ```

   Ordinary sign-in asks only for identity. Calendar scopes are requested separately
   when an authenticated host chooses **Connect Google Calendar**.
6. Create a **Web application** OAuth client. Add the exact callback above to
   **Authorized redirect URIs**. No browser-side token exchange or implicit grant
   is used. Download its JSON into a private directory, not this repository.
7. On the server, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` using the
   downloaded web client. Don't paste secrets into chat, source files, or GitHub.

Google references: [Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[token expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
[create credentials](https://developers.google.com/workspace/guides/create-credentials).

## 2. Microsoft / Outlook

1. Open [Microsoft Entra app registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
   Create **SNAIL Office Hours** in an authorized tenant. If Stanford disallows
   student-created registrations or requires admin consent, request approval from
   Stanford IT. Do not grant application-wide mailbox access or impersonation.
2. For both Stanford sign-in and connections to personal Outlook calendars, select
   **Accounts in any organizational directory and personal Microsoft accounts**.
   If only Stanford calendars are needed, an institution-approved registration
   can be restricted appropriately, with matching endpoint configuration.
3. Add a **Web** platform (not SPA) with the exact callback above. Leave implicit
   access-token and ID-token grants off; this uses authorization code + PKCE.
4. Add **delegated Microsoft Graph permissions**:

   ```text
   openid
   profile
   email
   User.Read
   offline_access
   Calendars.ReadWrite
   ```

5. Create a client secret with a documented expiry. Store its **Value**, not its
   Secret ID, securely. Set `MICROSOFT_CLIENT_ID` to the Application (client) ID and
   `MICROSOFT_CLIENT_SECRET` to that secret value. Put a renewal reminder in your
   calendar; expiry interrupts calendar refresh.
6. Obtain institution/admin approval if the sign-in screen requires it. The app
   verifies Stanford membership against tenant
   `396573cb-f378-4b68-9bc8-15755c0c51f3`; a matching typed email alone is insufficient.

References: [Register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app),
[authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

## 3. Install credentials securely

SSH through Google's authenticated IAP tunnel (no public SSH port):

```bash
gcloud compute ssh klemenkotar@snail-services \
  --project=tpucloud-196821 --zone=us-central1-b --tunnel-through-iap
```

On that VM, use `sudoedit /etc/snail/office-hours.env` to set only the four OAuth
client values. Keep the existing `TOKEN_ENCRYPTION_KEY` unchanged. This file is
root-only; never print it in a shared terminal, logs, a support ticket, or chat.

```bash
sudo systemctl restart snail-office-hours
sudo systemctl --no-pager is-active snail-office-hours
```

An alternative is to provide Codex with the paths to privately saved credential
files so it can install them without displaying their contents.

## 4. Each host connects their own account

1. Open Office Hours and sign in with a verified Stanford identity. Host access is
   restricted to `yamins@stanford.edu` (Dan) and `klemenk@stanford.edu` (Klemen).
   Confirm these are the accounts you actually sign in with; aliases must be
   deliberately configured on the server, not accepted from a form.
2. In **Your calendar, connected**, choose Google or Outlook. That calendar
   account may differ from the Stanford sign-in account, because the connecting
   user has already been verified as a host.
3. Select all calendars that should block availability. Choose one writable
   calendar for new bookings. Google booking calendars must be owned by the host.
   This version supports one connected provider account per host, with multiple
   calendars from that account. Dan and Klemen can use different providers.
4. Save. Create a normal busy event during office hours and verify that the slot
   disappears on refresh. Remove the test event, book a slot, check the invitation
   and host calendars, and cancel it through the site. Repeat for **both hosts**
   and for a 60-minute meeting.
5. Do these live tests before announcing that bookings are open. Automated tests
   use provider fixtures; they do not establish that university consent policies
   or your individual accounts work.

Calendar writes are not a cross-provider transaction. Local reservations are
atomic for both hosts; durable pending operations retry each minute after a
provider failure. A slot stays held until cancellation reaches all calendars.
Confirmed meetings are not automatically rescheduled/cancelled when someone adds
a conflicting event later. Contact participants and use this page to cancel.

## Cost / infrastructure

Created specifically for this service in `tpucloud-196821`:

- `snail-services`: non-Spot **f1-micro**, `us-central1-b`, Debian 12, 10 GB
  `pd-standard` persistent boot disk; the disk is retained if the VM is deleted.
- `snail-services-ip`: reserved Standard-tier IPv4 **35.206.117.162**.
- Dedicated VPC `snail-services`, subnet `snail-services-us-central1`
  (`10.77.0.0/28`), web firewall on 80/443, SSH from IAP only.
- No attached Google service account, no Cloud SQL, load balancer, NAT gateway,
  Secret Manager, or paid DNS service. No existing compute/TPU resources changed.
- Public API address uses free **sslip.io DNS** and an automatically renewed TLS
  certificate. The reserved IP is stable. DNS availability depends on sslip.io;
  a lab-owned hostname can replace it later without changing the OAuth callback.

At 730 hours, list-price compute $5.55 + IPv4 $3.65 + disk about $0.40 = **$9.60/month**
before sustained-use/free-disk discounts, traffic, and tax. Eligible 30% sustained
use on compute brings the baseline to about **$7.93**. A 31-day undiscounted
baseline is about **$9.78**. Actual billing eligibility/negotiated rates cannot be
verified with the current account permissions. This is an estimate, **not a hard
spending cap**: unusual traffic or future endpoints can add charges. Review
billing; don't add paid infrastructure without revisiting the budget.

An e2-micro offers more RAM and may be cheaper if a billing administrator confirms
the account's free-tier eligibility and unused allowance; it is not the deployed
type. No preemptible/Spot availability assumptions are used here.

Prices: [compute](https://cloud.google.com/products/compute/pricing/general-purpose),
[IPv4](https://cloud.google.com/vpc/pricing),
[disks](https://cloud.google.com/compute/disks-image-pricing),
[sustained use](https://docs.cloud.google.com/compute/docs/sustained-use-discounts).
