import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () => {
    const siteUrl = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "") ?? null;
    if (!siteUrl) {
      return new Response("Missing CONVEX_SITE_URL", { status: 500 });
    }

    return new Response(
      JSON.stringify({
        issuer: siteUrl,
        jwks_uri: `${siteUrl}/.well-known/jwks.json`,
        authorization_endpoint: `${siteUrl}/oauth/authorize`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
        },
      },
    );
  }),
});

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async () => {
    if (!process.env.JWKS) {
      return new Response("Missing JWKS env var", { status: 500 });
    }
    return new Response(process.env.JWKS, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
      },
    });
  }),
});

export default http;
