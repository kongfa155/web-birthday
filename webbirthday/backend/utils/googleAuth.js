import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

export async function verifyGoogleCredential(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error("Google login is not configured");
  const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)
    || payload.aud !== process.env.GOOGLE_CLIENT_ID
    || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()
    || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255) {
    throw new Error("Invalid Google identity");
  }
  return payload;
}

// An object export makes the network verification boundary mockable without weakening production.
export const googleVerifier = { verify: verifyGoogleCredential };
