import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import { ADDONS_PATH, Addon } from './util';

const readdirAsync = (
  p: string,
  options: Parameters<typeof fs['readdir']>[1] = { withFileTypes: true }
) => fs.promises.readdir(p, options);

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    myPing() {
      ipcRenderer.send('ipc-example', 'ping');
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
          func(...args);
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, subscription);

        return () => ipcRenderer.removeListener(channel, subscription);
      }

      return undefined;
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.once(channel, (_event, ...args) => func(...args));
      }
    },
    getInstalledAddons() {
      return readdirAsync(ADDONS_PATH).then((r) => {
        const modules = r
          .filter((f) => f.isDirectory())
          .map(({ name }) => name)
          .map((name, _, arr) => {
            const dir = fs.readdirSync(path.join(ADDONS_PATH, name));

            const toc = (
              dir.includes(`${name}.toc`)
                ? `${name}.toc`
                : dir.find((file) =>
                    new RegExp(`^(${name})?.*[.]toc`).test(file)
                  )
            ) as string;
            if (toc) {
              const infoPath = path.join(ADDONS_PATH, name, toc);
              const version = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(/## Version:\s*\b(.+)\b/i)?.[1];
              const dependencies = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(
                  /## (?:RequiredDeps|Dependencies|OptionalDeps):\s*(.+)[\r\n]/i
                )?.[1]
                ?.toLowerCase()
                ?.split(/,\s?/);

              const submodule =
                !!parseInt(
                  fs
                    .readFileSync(infoPath, 'utf8')
                    ?.match(/## LoadOnDemand:\s*(\d)\s/i)?.[1] as string,
                  10
                ) || new RegExp(`(${dependencies?.join('|')})`, 'i').test(name);

              const title = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(/## Title:\s*(.+)[\r\n]/i)?.[1]
                ?.replace(/([|](cff(?:\w|\d){6}|r))/gi, '');

              const notes = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(/## Notes:\s*(.+)[\r\n]/i)?.[1]
                ?.replace(/([|](cff(?:\w|\d){6}|r))/gi, '');

              // console.log(name, dependencies);

              const parent =
                (submodule &&
                  arr.find((v) => dependencies?.includes(v.toLowerCase()))) ||
                null;

              return {
                name,
                version,
                parent,
                title: title?.match(new RegExp(`${notes}`, 'i'))
                  ? notes
                  : title,
              };
            }

            return null;
          })
          .filter(Boolean) as Addon[];

        return Object.values(
          modules.reduce((acc, curr) => {
            return curr.parent
              ? {
                  ...acc,
                  [curr.parent]: {
                    ...acc[curr.parent],
                    submodules: [...(acc[curr.parent]?.submodules || []), curr],
                  },
                }
              : {
                  ...acc,
                  [curr.name]: curr,
                };
          }, {} as Record<string, Addon>)
        );
      });
    },
  },
});
