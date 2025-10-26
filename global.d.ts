interface Gtag {
  (command: "config", targetId: string, config?: Record<string, unknown>): void;
  (...args: unknown[]): void;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export {};
