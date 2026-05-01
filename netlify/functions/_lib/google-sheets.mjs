const DEFAULT_RANGE = "Leads!A:O";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let cachedToken = null;

function base64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(key) {
  return String(key || "").replace(/\\n/g, "\n");
}

function parseServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY)
  };
}

async function signJwt(privateKey, content) {
  const pem = normalizePrivateKey(privateKey)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(content)
  );

  return base64url(new Uint8Array(signature));
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const account = parseServiceAccount();
  if (!account.client_email || !account.private_key) {
    throw new Error("Google service account credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  }));
  const unsignedJwt = `${header}.${claims}`;
  const jwt = `${unsignedJwt}.${await signJwt(account.private_key, unsignedJwt)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google auth failed.");
  }

  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  };
  return cachedToken.accessToken;
}

export async function appendSheetRow(row) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  }

  const range = process.env.GOOGLE_SHEETS_RANGE || DEFAULT_RANGE;
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [row] })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Sheets append failed.");
  }

  return payload;
}
