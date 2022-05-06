import { Addon } from 'main/util';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        myPing(): void;
        on(
          channel: string,
          func: (...args: unknown[]) => void
        ): (() => void) | undefined;
        once(channel: string, func: (...args: unknown[]) => void): void;
        getInstalledAddons(): Promise<Addon[]>;
      };
    };
  }
}

export {};
