import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import { ADDONS_PATH } from './util';

const Crawler = require('crawler');

const readdirAsync = (
  p: string,
  options: Parameters<typeof fs['readdirSync']>[1] = { withFileTypes: true }
) =>
  new Promise<fs.Dirent[]>((resolve, reject) =>
    fs.readdir(p, options, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    })
  );

const scrapeVersion = (addon: string) => {
  const c = new Crawler({
    maxConnections: 10,
    timeout: 5000,
    // This will be called for each crawled page
    callback: (error: string, res: { $: unknown }, done: () => void) => {
      if (error) {
        console.log(error);
      } else {
        const { $ } = res;
        // $ is Cheerio by default
        // a lean implementation of core jQuery designed specifically for the server
        const version = $('body').text();
        console.log(version);
      }
      done();
    },
  });
  c.queue(`https://www.curseforge.com/wow/addons/weakauras-2/files`);
};

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
          .map((name, i, arr) => {
            const infoPath = path.join(ADDONS_PATH, name, `${name}.toc`);
            if (fs.existsSync(infoPath)) {
              const version = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(/## Version:\s*(.+)\s/i)?.[1];
              const submodule = !!parseInt(
                fs
                  .readFileSync(infoPath, 'utf8')
                  ?.match(/## LoadOnDemand:\s*(\d)\s/i)?.[1] as string,
                10
              );
              const dependencies = fs
                .readFileSync(infoPath, 'utf8')
                ?.match(/## Dependencies:\s*(.+)[\r\n]/i)?.[1]
                ?.split(/,\s?/);

              return {
                name,
                version,
                submodule,
                parent: dependencies?.find((v) => arr.includes(v)),
              };
            }

            return null;
            // const version = fs
            //   .readFileSync(
            //     path.join(ADDONS_PATH, name, `${name}.toc`),
            //     'utf-8'
            //   )
            //   .match(/version:\s?(.+)$/i)?.[1];
            // console.log(path.join(ADDONS_PATH, name, `${name}.toc`), version);
            // const info = JSON.stringify({
            //   name,
            //   version,
            // });
            // fs.writeFileSync(infoPath, info);
            // return info;
          })
          .filter(Boolean) as Addon[];

        return Object.values(
          modules.reduce(
            (acc, curr) =>
              curr.parent
                ? {
                    ...acc,
                    [curr.parent]: {
                      ...acc[curr.parent],
                      submodules: [
                        ...(acc[curr.parent]?.submodules || []),
                        curr,
                      ],
                    },
                  }
                : {
                    [curr.name]: curr,
                  },
            {} as Record<string, Addon>
          )
        );
      });
    },
  },
});
