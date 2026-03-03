import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { SignJWT, importPKCS8 } from "jose";
import { consumeOneTimeMagicLink, verifyMagicLinkToken } from "@/lib/magic-link";

function getConvexIssuer() {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) return null;
  return siteUrl.replace(/\/+$/, "");
}

function isE2EAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_AUTH_ENABLED === "1"
  );
}

function buildProviders() {
  const providers: NextAuthOptions["providers"] = [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ];

  if (isE2EAuthEnabled()) {
    providers.push(
      CredentialsProvider({
        name: "E2E Test Login",
        credentials: {
          email: { label: "Email", type: "email" },
          name: { label: "Name", type: "text" },
          userId: { label: "User ID", type: "text" },
        },
        authorize(credentials) {
          const userId = credentials?.userId?.trim() || "e2e-user";
          const email = credentials?.email?.trim() || "e2e@aiankipro.com";
          const name = credentials?.name?.trim() || "E2E Test User";
          return {
            id: userId,
            email,
            name,
          };
        },
      }),
    );
  }

  providers.push(
    CredentialsProvider({
      id: "magic-link",
      name: "Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.token?.trim();
        if (!token) return null;
        try {
          const claims = await verifyMagicLinkToken(token);
          const consume = await consumeOneTimeMagicLink({ token, claims });
          if (!consume.ok) return null;
          return {
            id: claims.userId,
            email: claims.email,
            name: claims.name,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      const userId = token.sub;
      const privateKeyPem = process.env.CONVEX_AUTH_PRIVATE_KEY;
      const keyId = process.env.CONVEX_AUTH_KID;
      const issuer = getConvexIssuer();

      if (!userId || !privateKeyPem || !issuer || !keyId) {
        return session;
      }

      const privateKey = await importPKCS8(
        privateKeyPem.replace(/\\n/g, "\n"),
        "RS256",
      );

      const convexToken = await new SignJWT({
        sub: userId,
        email: typeof token.email === "string" ? token.email : undefined,
        name: typeof token.name === "string" ? token.name : undefined,
        picture: typeof token.picture === "string" ? token.picture : undefined,
      })
        .setProtectedHeader({ alg: "RS256", kid: keyId })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience("convex")
        .setExpirationTime("1h")
        .sign(privateKey);

      (session as typeof session & { convexToken: string }).convexToken =
        convexToken;
      return session;
    },
  },
};
