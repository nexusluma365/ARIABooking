const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function getRedirectUri(request) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }

  const url = new URL(request.url);
  return `${url.origin}/.netlify/functions/google-auth-callback`;
}

export default async (request) => {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return new Response("GOOGLE_OAUTH_CLIENT_ID is not configured.", { status: 500 });
  }

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SHEETS_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return Response.redirect(authUrl.toString(), 302);
};
