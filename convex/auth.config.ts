import type { AuthConfig } from "convex/server";

const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "");
if (!siteUrl) {
  throw new Error("Missing CONVEX_SITE_URL for Convex auth provider config");
}

export default {
  providers: [
    {
      type: "customJwt",
      issuer: siteUrl,
      jwks: `${siteUrl}/.well-known/jwks.json`,
      algorithm: "RS256",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
