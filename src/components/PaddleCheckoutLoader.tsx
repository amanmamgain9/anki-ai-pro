"use client";

import Script from "next/script";

type PaddleEvent = {
  name?: string;
};

const paddleScript = "https://cdn.paddle.com/paddle/v2/paddle.js";

export default function PaddleCheckoutLoader({
  clientToken,
  paddleEnv,
}: {
  clientToken: string;
  paddleEnv: string;
}) {
  return (
    <Script
      src={paddleScript}
      strategy="afterInteractive"
      onLoad={() => {
        const successUrl = `${window.location.origin}/settings?billing=success`;
        const paddle = window.Paddle;
        if (!paddle || typeof paddle.Initialize !== "function") return;
        if (paddleEnv === "sandbox" && paddle.Environment?.set) {
          paddle.Environment.set("sandbox");
        }
        paddle.Initialize({
          token: clientToken,
          eventCallback(event: PaddleEvent) {
            if (event?.name === "checkout.completed") {
              window.location.replace(successUrl);
            }
          },
          checkout: {
            settings: {
              displayMode: "overlay",
              successUrl,
            },
          },
        });
      }}
    />
  );
}
