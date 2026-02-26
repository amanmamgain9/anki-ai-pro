import { randomUUID } from "node:crypto";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const kid = randomUUID();
const privatePem = await exportPKCS8(privateKey);
const publicJwk = await exportJWK(publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", kid, ...publicJwk }] });

console.log(
  `CONVEX_AUTH_PRIVATE_KEY="${privatePem.replace(/\n/g, "\\n")}"`,
);
console.log(`CONVEX_AUTH_KID="${kid}"`);
console.log(`JWKS='${jwks}'`);
