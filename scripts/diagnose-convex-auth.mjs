import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  SignJWT,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
} from "jose";

function parseEnvFile(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function printCheck(ok, label, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  const suffix = detail ? `: ${detail}` : "";
  console.log(`${status} ${label}${suffix}`);
}

async function main() {
  const envPath = path.resolve(".env.local");
  const envRaw = await fs.readFile(envPath, "utf8");
  const env = parseEnvFile(envRaw);

  const siteUrlRaw = env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const privateKeyRaw = env.CONVEX_AUTH_PRIVATE_KEY;
  const keyId = env.CONVEX_AUTH_KID;

  if (!siteUrlRaw || !privateKeyRaw || !keyId) {
    printCheck(
      false,
      "Required env",
      "Need NEXT_PUBLIC_CONVEX_SITE_URL, CONVEX_AUTH_PRIVATE_KEY, and CONVEX_AUTH_KID in .env.local",
    );
    process.exit(1);
  }

  const issuer = normalizeUrl(siteUrlRaw);
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n");

  const privateKey = await importPKCS8(privateKeyPem, "RS256");

  printCheck(true, "Issuer", issuer);
  printCheck(true, "Audience", "convex");
  printCheck(true, "Key ID", keyId);

  const openidUrl = `${issuer}/.well-known/openid-configuration`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  let openid;
  let jwks;
  try {
    const [openidRes, jwksRes] = await Promise.all([
      fetch(openidUrl),
      fetch(jwksUrl),
    ]);
    if (!openidRes.ok) {
      throw new Error(`openid status ${openidRes.status}`);
    }
    if (!jwksRes.ok) {
      throw new Error(`jwks status ${jwksRes.status}`);
    }
    openid = await openidRes.json();
    jwks = await jwksRes.json();
  } catch (err) {
    printCheck(false, "Fetch remote OIDC/JWKS", String(err));
    process.exit(1);
  }

  printCheck(
    openid.issuer === issuer,
    "OIDC issuer matches local issuer",
    `remote=${openid.issuer ?? "missing"}`
  );

  const remoteKeys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const localJwksPath = path.resolve(".convex-jwks.json");
  try {
    const localJwksRaw = await fs.readFile(localJwksPath, "utf8");
    const localJwks = JSON.parse(localJwksRaw);
    const localKeys = Array.isArray(localJwks.keys) ? localJwks.keys : [];
    const localRsa = localKeys.find((k) => k?.kty === "RSA");
    if (!localRsa?.n || !localRsa?.e) {
      printCheck(false, "Local .convex-jwks.json key format", "No RSA n/e fields found");
    } else if (!localRsa?.kid) {
      printCheck(false, "Local .convex-jwks.json key format", "Missing kid");
    } else if (localRsa.kid !== keyId) {
      printCheck(
        false,
        "Local key id matches CONVEX_AUTH_KID",
        `local kid=${localRsa.kid}, env kid=${keyId}`,
      );
    } else {
      const matchedKey = remoteKeys.find(
        (k) =>
          k?.kty === "RSA" &&
          k?.kid === keyId &&
          k?.n === localRsa.n &&
          k?.e === localRsa.e,
      );
      printCheck(
        Boolean(matchedKey),
        "Remote JWKS matches local .convex-jwks.json",
        matchedKey
          ? `matched n prefix=${localRsa.n.slice(0, 16)}...`
          : `local n prefix=${localRsa.n.slice(0, 16)}...`,
      );
    }
  } catch {
    printCheck(
      false,
      "Read local .convex-jwks.json",
      "File missing or invalid JSON (cannot compare key material)",
    );
  }

  const probeToken = await new SignJWT({ sub: "convex-auth-diagnostics" })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience("convex")
    .setExpirationTime("5m")
    .sign(privateKey);

  try {
    const remoteJwks = createRemoteJWKSet(new URL(jwksUrl));
    await jwtVerify(probeToken, remoteJwks, {
      issuer,
      audience: "convex",
    });
    printCheck(true, "Probe token verifies against remote JWKS");
  } catch (err) {
    printCheck(false, "Probe token verifies against remote JWKS", String(err));
    process.exit(1);
  }

  console.log("");
  console.log("If all checks PASS but app still says 'Data auth mismatch':");
  console.log("1) Fully stop all Next.js dev servers and start a single one.");
  console.log("2) Sign out, clear site cookies for localhost:3000, sign in again.");
  console.log("3) Run `npx convex dev --once` from this repo to push current auth.config.ts.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
