export {};

declare global {
  interface Window {
    __aiankiPaddleInitialized?: boolean;
    __aiankiPaddleCheckoutSuccessUrl?: string;
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
      Checkout?: {
        open?: (options: {
          items: Array<{
            priceId: string;
            quantity: number;
          }>;
          customer?: {
            id?: string;
            email?: string;
          };
          customData?: Record<string, string>;
        }) => void;
      };
      Environment?: {
        set?: (value: "sandbox") => void;
      };
    };
  }
}
