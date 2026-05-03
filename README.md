# Nexus Luma Booking Flow

Static multi-step booking funnel prepared for GitHub + Netlify.

## Flow

1. [`lead-capture-funnel.html`](./lead-capture-funnel.html) is the landing page
2. Landing CTAs send visitors to [`questionnaire.html`](./questionnaire.html)
3. After question 5, the questionnaire fades out and hands off to [`aria-booking-ai-vapi-wired.html`](./aria-booking-ai-vapi-wired.html)
4. The ARIA demo completes and routes to [`aria-strategy-apple.html`](./aria-strategy-apple.html) as the final paywall step
5. ARIA syncs lead/transcript data to Netlify Functions

## Netlify Setup

This repo includes:

- `netlify.toml`
- `netlify/functions/lead-sync.mjs`
- `netlify/functions/vapi-webhook.mjs`

Deploy as a standard static site on Netlify with the project root as the publish directory.

## Required Netlify Environment Variables

Set these in Netlify with `Functions` scope:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_RANGE`

OAuth option:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

Service account option:

- `GOOGLE_SERVICE_ACCOUNT_JSON`

Or instead of `GOOGLE_SERVICE_ACCOUNT_JSON`:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Optional:

- `LEAD_SYNC_SECRET`
- `VAPI_WEBHOOK_SECRET`
- `VAPI_ASSISTANT_ID`

Netlify functions read runtime env vars via `process.env`, per Netlify Functions docs:
https://docs.netlify.com/build/functions/environment-variables/

## Google Sheets Setup

The backend appends rows using the Google Sheets `spreadsheets.values.append` API:
https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append

### OAuth Setup

Use this when the Sheets API should write as your Google user.

1. Enable the Google Sheets API in Google Cloud
2. Create an OAuth Client ID for a web application
3. Add this authorized redirect URI:

`https://nexusluma.com/.netlify/functions/google-auth-callback`

4. Set these in Netlify environment variables:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

5. Redeploy Netlify
6. Visit:

`https://nexusluma.com/.netlify/functions/google-auth-start`

7. Approve access and copy the returned refresh token into Netlify as:

- `GOOGLE_OAUTH_REFRESH_TOKEN`

8. Redeploy Netlify again

The client secret and refresh token must stay in Netlify environment variables only. Do not commit them to the repo.

### Service Account Setup

Use this when the Sheets API should write as a Google service account.

Before this works:

1. Create a Google Cloud service account
2. Enable the Google Sheets API
3. Share the target spreadsheet with the service account email as an editor
4. Put the credentials into Netlify environment variables

Default sheet range is `Leads!A:O`.

Suggested columns:

1. Timestamp
2. Source
3. Event Type
4. Call ID
5. Name
6. Business Name / Type
7. Service
8. Lead Challenge
9. Lead Spend
10. Location
11. Email
12. Booking Intent
13. Ended Reason
14. Recording URL
15. Transcript

## Vapi Setup

The ARIA page already contains the provided public key and assistant ID in the browser file.

For direct backend transcript delivery from Vapi, configure your assistant or org server URL to:

`https://YOUR-NETLIFY-DOMAIN/api/vapi-webhook`

Vapi server URLs and server events docs:

- https://docs.vapi.ai/server-url/
- https://docs.vapi.ai/server-url/setting-server-urls
- https://docs.vapi.ai/server-url/events

Recommended server events to enable for the assistant:

- `end-of-call-report`
- `transcript`
- `status-update`

Notes:

- `vapi-webhook.mjs` appends to Sheets on `end-of-call-report`
- `lead-sync.mjs` is a browser-origin fallback that posts the captured session/transcript snapshot to Netlify on completion

## Booking Confirmation Email

The Google Apps Script webhook in [`aria-google-sheets-sync.gs`](./aria-google-sheets-sync.gs) writes questionnaire and ARIA call updates into the `Warm Leads` sheet tab. It first matches an existing row by `sessionId`, then by email, so the email captured in the questionnaire is reused when ARIA books the appointment.

When ARIA posts a `completion` event with an email address and appointment time, the script stores the appointment in `bookingSlot` on the same `Warm Leads` row and sends a branded confirmation email.

- Subject: `Nexus Luma`
- Headline: `Your Appointment Has Been Booked!`
- Email body includes: `Thank you for booking with ARIA by Nexus Luma` and the confirmed appointment

After changing this file, redeploy the Apps Script Web App so the live webhook uses the latest email sender. The script records `emailSentAt` and `emailStatus` in the sheet to avoid duplicate sends for the same session.

## Local Preview

Run any static server from the repo root, for example:

```bash
python3 -m http.server 8000
```

Open:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/lead-capture-funnel.html`
- `http://127.0.0.1:8000/questionnaire.html`
- `http://127.0.0.1:8000/aria-booking-ai-vapi-wired.html`
- `http://127.0.0.1:8000/aria-strategy-apple.html`

## Important Limits

What is fully prepared in this repo:

- GitHub-friendly project structure
- Netlify-ready static hosting + serverless functions
- Root `index.html`
- Frontend funnel wiring
- Browser-to-backend lead sync
- Vapi webhook endpoint scaffold
- Google Sheets append integration scaffold

What still must be configured outside the repo:

- Netlify env vars
- Spreadsheet sharing permissions
- Vapi assistant server URL in dashboard
- Optional webhook secrets in Vapi/Netlify
