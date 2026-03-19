export function getPublicPaddleEnvironment() {
  const value = process.env.NEXT_PUBLIC_PADDLE_ENV;
  if (!value || value === "sandbox") return "sandbox";
  if (value === "production") return "production";
  throw new Error("Invalid NEXT_PUBLIC_PADDLE_ENV. Use 'sandbox' or 'production'.");
}

export function getPublicPaddleClientToken() {
  return process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
}
