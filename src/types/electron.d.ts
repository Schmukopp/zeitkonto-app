export {};

declare global {
  interface Window {
    orgaboard?: {
      getVersion: () => Promise<string>;
    };
  }
}
