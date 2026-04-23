// Global TypeScript declarations
declare global {
  interface Window {
    ethereum?: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request: (args: { method: string; params?: any[] | undefined }) => Promise<any>;
    };
  }
}

export {};
