import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SignJWT, importPKCS8 } from "jose";

function getConvexIssuer() {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) return null;
  return siteUrl.replace(/\/+$/, "");
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
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
