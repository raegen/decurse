/* eslint-disable no-useless-escape */
/* eslint-disable promise/always-return */
import {
  Box,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
  ThemeProvider,
} from '@mui/material';
import { createTheme } from '@mui/material/styles';
import purple from '@mui/material/colors/purple';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import LinearProgress from '@mui/material/LinearProgress';
import { Addon } from 'main/util';
import React, { FC, useEffect, useState } from 'react';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  map,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
} from 'rxjs';
import {
  useQuery,
  QueryClientProvider,
  QueryClient,
  useIsFetching,
} from 'react-query';
import './App.css';

const MAX_SCRAPE_WORKERS = 5;
const queryClient = new QueryClient();

export class Queue<T> {
  private workers = new Map();

  private available$: Observable<T[]>;

  constructor(workers: [T, BehaviorSubject<boolean>][]) {
    this.workers = new Map(workers);
    this.available$ = combineLatest(
      [...this.workers.entries()].map(([w, s]) =>
        s.pipe(
          map((v: boolean) => (v ? w : null)),
          distinctUntilChanged(),
          debounceTime(250)
        )
      ) as Observable<T>[]
    ).pipe(
      map((ws) => {
        return ws.filter(Boolean);
      }),
      filter((ws) => !!ws.length),
      distinctUntilChanged((prev, current) => prev.length === current.length)
    );
  }

  private subscriptions = new Map();

  add<R>(fn: (worker: T) => Promise<R>) {
    if (!this.subscriptions.get(fn)) {
      this.subscriptions.set(
        fn,
        firstValueFrom(this.available$).then(([worker]) => {
          this.workers.get(worker).next(false);
          this.subscriptions.delete(fn);
          return fn(worker).finally(() => this.workers.get(worker).next(true));
        })
      );
    }
    return this.subscriptions.get(fn);
  }
}

interface WebviewTag extends Electron.WebviewTag {
  ready: Promise<Event>;
  defaultUserAgent: string;
}

const scrapeRoots = document.getElementById('scrape-roots');
for (let i = 0; i < MAX_SCRAPE_WORKERS; i += 1) {
  const element = document.createElement('webview') as WebviewTag;
  element.disablewebsecurity = true;
  element.style.flex = '0 0 0';
  element.style.width = '0';
  element.style.height = '0';

  element.ready = new Promise<Event>((resolve) =>
    element.addEventListener('dom-ready', resolve)
  ).then(
    () =>
      new Promise<Event>((resolve) =>
        element.addEventListener('did-finish-load', resolve)
      )
  );
  // element.ready
  //   .then(() => {
  //     element.defaultUserAgent = element.getUserAgent();
  //     element.setUserAgent(
  //       'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  //     );
  //   })
  //   .catch(console.log);
  element.src = 'https://www.curseforge.com';

  scrapeRoots?.appendChild(element);
}

const queue = new Queue<WebviewTag>(
  (Array.from(scrapeRoots?.children as HTMLCollection) as WebviewTag[]).map(
    (el: WebviewTag) => {
      const status = new BehaviorSubject(false);
      el.ready.then(() => status.next(true)).catch(console.log);
      return [el, status];
    }
  )
);

const isUnsupported = ({ error }: ScrappedData) => error === 'unsupported';

const getAddonDataInjectable = function () {
  const tr = Array.from(document.querySelectorAll('.listing tr') || []).find(
    (el) => {
      const td = el.querySelector('td:nth-child(2)');
      return td && !td?.innerText.match(/bcc|classic|tbc/i);
    }
  );
  return `{"version": "${
    tr?.querySelector('td:nth-child(2)')?.innerText
  }", "url": "${
    tr?.querySelector('td:last-child [data-tooltip="Download file"]')?.href
  }"}`;
};

const isCaptcha = function () {
  return !!document.querySelector('#challenge-form');
};

const handleCaptcha = function () {
  const form = document.querySelector('#challenge-form');
  if (form) {
    // form.scrollIntoView({ inline: 'center' });
    return true;
  }
  return false;
};

const captchaResolving$ = new BehaviorSubject(false);

const useAddonData = ({ addon, title }: { addon: string; title: string }) => {
  // const elementRef = React.useRef<Electron.WebviewTag>();
  // const onReadyRef = React.useRef<Promise<void | Event>>();

  // useEffect(() => {
  //   elementRef.current = document.createElement('webview');
  //   const element = elementRef.current;
  //   if (element) {
  //     element.disablewebsecurity = true;
  //     element.style.flex = '0 0 0';
  //     element.style.width = '0';
  //     element.style.height = '0';
  //     onReadyRef.current = new Promise<Event>((resolve) =>
  //       element.addEventListener('dom-ready', resolve)
  //     ).then(
  //       () =>
  //         new Promise<Event>((resolve) =>
  //           element.addEventListener('did-finish-load', resolve)
  //         )
  //     );
  //     element.src = `https://www.curseforge.com/wow/addons/search?search=${addon}`;
  //     scrapeRoots?.appendChild(element);
  //   }

  //   return () => element.remove();
  // }, [addon]);
  const download = React.useCallback(
    (url) =>
      queue
        .add((element: WebviewTag) => element.loadURL(url))
        .catch(console.log) as Promise<ScrappedData>,
    []
  );

  const job = React.useCallback(
    (element: WebviewTag) => {
      console.log('adding', title, addon);
      const searchID = title || addon;
      const searchURL = `https://www.curseforge.com/wow/addons/search?search=${encodeURIComponent(
        searchID
      )}`;
      console.log(searchURL);
      return element
        .loadURL(searchURL)
        .then(() =>
          element
            .executeJavaScript(
              `document.querySelector('.project-listing-row a').href`
            )
            .catch((e) => {
              return element
                .executeJavaScript(`(${isCaptcha.toString()}())`)
                .then((captcha) => {
                  if (captcha) {
                    if (captchaResolving$.getValue()) {
                      return firstValueFrom(
                        captchaResolving$.pipe(filter((v) => !v))
                      ).then(() => element.loadURL(searchURL));
                    }
                    captchaResolving$.next(true);
                    element.classList.add('webview-popup');
                    const searchRequest = element.findInPage(searchID);

                    return element
                      .executeJavaScript(`(${handleCaptcha.toString()}())`)
                      .then(() =>
                        new Promise<void>((resolve) => {
                          // element.setUserAgent(element.defaultUserAgent);s
                          element.addEventListener(
                            'found-in-page',
                            ({ result: { requestId, matches } }) => {
                              if (requestId === searchRequest && matches) {
                                element.stopFindInPage('clearSelection');
                                element.classList.remove('webview-popup');
                                captchaResolving$.next(false);
                                resolve();
                              }
                            }
                          );
                        }).then(() =>
                          element.executeJavaScript(
                            `document.querySelector('.project-listing-row a').href`
                          )
                        )
                      );
                  }

                  return e;
                });
            })
        )
        .catch(() => {
          throw new Error('unsupported');
        })
        .then((url: string) => {
          return element.loadURL(`${url}/files`);
        })
        .then(() =>
          element.executeJavaScript(`(${getAddonDataInjectable.toString()}())`)
        )
        .then((data?: string) => {
          const { version, url } = data
            ? JSON.parse(data)
            : { version: null, url: null };
          return {
            version,
            url,
            download: () => download(url),
            loading: false,
          };
        })
        .catch((e: Error) => {
          return {
            version: null,
            url: null,
            loading: false,
            error: e.message,
          };
        });
    },
    [addon, download, title]
  );

  return useQuery<ScrappedData | void>(
    ['addon', addon],
    async () => {
      // console.log('using query');
      return queue
        .add<ScrappedData>(job)
        .catch(console.log) as Promise<ScrappedData>;
    },
    {
      staleTime: Infinity,
    }
  );
};

export const Loading: FC = () => {
  const isFetching = useIsFetching();

  return isFetching ? <LinearProgress /> : null;
};

interface ScrappedData {
  version: string | null;
  url: string | null;
  download?: () => void;
  loading: boolean;
  error?: string | null;
}

const AddonData: FC<{
  addon: string;
  title: string;
  children?: (data: ScrappedData) => React.ReactNode;
}> = ({
  addon,
  title,
  children,
}: {
  addon: string;
  title: string;
  children?: (data: ScrappedData) => React.ReactNode;
}) => {
  // console.log('addonData', addon, title);
  const { data, isLoading } = useAddonData({ addon, title });

  return children?.({
        ...(data || { version: null, url: null }),
        loading: isLoading,
      }) || null
};

interface WebView extends HTMLWebViewElement {
  executeJavaScript: <T>(code: string) => Promise<T>;
  loadURL: (url: string) => Promise<void>;
  downloadURL: (url: string) => Promise<void>;
}

const Item: FC<Partial<Addon>> = ({
  name,
  version,
  title,
  submodules = [],
}) => {
  const [state, setState] = useState(false);

  return (
    <>
      <ListItem disablePadding>
        <AddonData addon={name as string} title={title as string}>
          {({ version: lts, error, loading, download }) => (
            <>
              <ListItemButton color="primary" disableGutters>
                <ListItemButton
                  style={{
                    flexGrow: 0,
                    paddingLeft: 10,
                    paddingRight: 10,
                    visibility: submodules.length ? 'visible' : 'hidden',
                  }}
                  onClick={() => setState(!state)}
                >
                  <ListItemIcon style={{ minWidth: 0 }}>
                    {state ? <ExpandLess /> : <ExpandMore />}
                  </ListItemIcon>
                </ListItemButton>
                <ListItemText
                  primary={title || name}
                  secondary={
                    <span style={{ display: 'flex' }}>
                      <span>{version || 'n/a'}</span>
                      <span style={{ width: 5 }} />
                      {error === 'unsupported' ? (
                        <span>Unsupported</span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          (
                          {loading || !lts ? (
                            <span style={{ filter: 'blur(5px)' }}>9.99.9</span>
                          ) : (
                            lts
                          )}{' '}
                          latest)
                        </span>
                      )}
                    </span>
                  }
                />
              </ListItemButton>
              {lts && !lts.includes(version as string) ? (
                <ListItemButton
                  style={{ flex: '0 0 auto' }}
                  onClick={() => download?.()}
                >
                  <ListItemText primary="Update" />
                </ListItemButton>
              ) : null}
            </>
          )}
        </AddonData>
      </ListItem>
      <Collapse in={state} timeout="auto" unmountOnExit>
        <List style={{ paddingLeft: 56 }} component="div" disablePadding>
          {submodules.map((s) => (
            <ListItemButton sx={{ pl: 4 }} key={s.name}>
              <ListItemText primary={s.title || s.name} secondary={s.version} />
            </ListItemButton>
          ))}
        </List>
      </Collapse>
    </>
  );
};

export const Installed = () => {
  const [items, setItems] = useState<Addon[]>([]);
  useEffect(() => {
    window.electron.ipcRenderer
      .getInstalledAddons()
      .then((addons) => {
        console.log(addons);
        setItems(addons);
      })
      .catch((e) => console.log(e));
  }, []);
  return (
    <div className="page">
      <Box
        sx={{ width: '100%', bgcolor: 'background.paper', overflowY: 'auto' }}
      >
        <List>
          {items.map((item) => (
            <React.Fragment key={item.name}>
              <Item {...item} />
            </React.Fragment>
          ))}
        </List>
      </Box>
    </div>
  );
};
export const Add = () => (
  <div className="page">
    <webview
      style={{ flex: '1 0 0' }}
      src="https://www.curseforge.com/wow/addons"
    />
  </div>
);

const theme = createTheme({
  palette: {
    primary: {
      main: purple[700],
    },
  },
});

export default function App() {
  const [tab, setTab] = useState<number>(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };
  return (
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <div className="view">
          <Loading />
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tab} onChange={handleChange}>
              <Tab label="Installed" />
              <Tab label="Add" />
            </Tabs>
          </Box>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              flex: '1 0 0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                flexDirection: 'row',
                display: 'flex',
                marginLeft: `calc(${-tab}*100%)`,
                width: '200%',
                flex: '1 0 0',
                height: '100%',
              }}
            >
              <div style={{ display: 'flex', flex: '1 0 0' }}>
                <Installed />
              </div>
              <div style={{ display: 'flex', flex: '1 0 0' }}>
                <Add />
              </div>
            </div>
          </div>
        </div>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
