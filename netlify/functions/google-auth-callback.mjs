const TOKEN_URL = "https://oauth2.googleapis.com/token";

function html(statusCode, body) {
  return new Response(body, {
    status: statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRedirectUri(request) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }

  const url = new URL(request.url);
  return `${url.origin}/.netlify/functions/google-auth-callback`;
}

export default async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return html(400, `<h1>Google authorization failed</h1><p>${escapeHtml(error)}</p>`);
  }

  if (!code) {
    return html(400, "<h1>Missing Google authorization code</h1>");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return html(500, "<h1>Google OAuth env vars are missing</h1><p>Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Netlify first.</p>");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(request)
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    return html(500, `<h1>Google token exchange failed</h1><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`);
  }

  if (!payload.refresh_token) {
    return html(500, "<h1>No refresh token returned</h1><p>Visit the auth start URL again. The flow uses prompt=consent so Google should return a refresh token.</p>");
  }

  return html(200, [
    "<h1>Google Sheets authorization complete</h1>",
    "<p>Add this value to Netlify as <strong>GOOGLE_OAUTH_REFRESH_TOKEN</strong>. Do not commit it to Git.</p>",
    `<pre>${escapeHtml(payload.refresh_token)}</pre>`
  ].join(""));
};
