export {};

declare global {
  interface Window {
    Paddle?: {
      Initialize?: (options: {
        token: string;
        eventCallback?: (event: { name?: string }) => void;
        checkout?: {
          settings?: {
            displayMode?: "overlay" | "inline";
            successUrl?: string;
          };
        };
      }) => void;
      Environment?: {
        set?: (value: "sandbox") => void;
      };
    };
  }
}
