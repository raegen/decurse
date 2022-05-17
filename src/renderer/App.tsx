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
  useQuery,
  QueryClientProvider,
  QueryClient,
  useIsFetching,
} from 'react-query';
import './App.css';

const queryClient = new QueryClient();

const scrapeRoots = document.getElementById('scrape-roots');

const useAddonData = ({ addon }: { addon: string }) => {
  const elementRef = React.useRef<Electron.WebviewTag>();
  const onReadyRef = React.useRef<Promise<void | Event>>();

  useEffect(() => {
    elementRef.current = document.createElement('webview');
    const element = elementRef.current;
    if (element) {
      element.disablewebsecurity = true;
      element.style.flex = '0 0 0';
      element.style.width = '0';
      element.style.height = '0';
      onReadyRef.current = new Promise<Event>((resolve) =>
        element.addEventListener('dom-ready', resolve)
      ).then(
        () =>
          new Promise<Event>((resolve) =>
            element.addEventListener('did-finish-load', resolve)
          )
      );
      element.src = `https://www.curseforge.com/wow/addons/search?search=${addon}`;
      scrapeRoots?.appendChild(element);
    }

    return () => element.remove();
  }, [addon]);

  return useQuery<ScrapedData | void>(
    ['addon', addon],
    async () => {
      const element = elementRef.current as Electron.WebviewTag;
      return onReadyRef.current
        ?.then(() =>
          element.executeJavaScript(
            `location.href=document.querySelector('.project-listing-row a').href`
          )
        )
        .then((url: string) => {
          return element.loadURL(`${url}/files`);
        })
        .then(() =>
          element.executeJavaScript(
            `\`{"version": "\$\{Array.from(document.querySelectorAll('.listing tr')).find((el) => {var td=el.querySelector('td:nth-child(2) a[data-action="file-link"]');return td && td?.innerText.match(/retail|^(?!bcc|classic|tbc).+$/i)}).querySelector('td:nth-child(2)')?.innerText\}", "url": "\$\{Array.from(document.querySelectorAll('.listing tr')).find((el) => {var td=el.querySelector('td:nth-child(2) a[data-action="file-link"]');return td && td?.innerText.match(/retail|^(?!bcc|classic|tbc).+$/i)}).querySelector('td:last-child [data-tooltip="Download file"]')?.href\}"}\``
          )
        )
        .then((data?: string) => {
          const { version, url } = data
            ? JSON.parse(data)
            : { version: null, url: null };
          return {
            version,
            url,
            download: () => element.downloadURL(url),
            loading: false,
          };
        })
        .catch(console.log);
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

interface ScrapedData {
  version: string | null;
  url: string | null;
  download?: () => void;
  loading: boolean;
}

const AddonData: FC<{
  addon: string;
  children?: (data: ScrapedData) => React.ReactNode;
}> = ({
  addon,
  children,
}: {
  addon: string;
  children?: (data: ScrapedData) => React.ReactNode;
}) => {
  const { data, isLoading } = useAddonData({ addon });

  return <>{children && data ? children(data) : data}</>;
};

interface WebView extends HTMLWebViewElement {
  executeJavaScript: <T>(code: string) => Promise<T>;
  loadURL: (url: string) => Promise<void>;
  downloadURL: (url: string) => Promise<void>;
}

const Item: FC<Partial<Addon>> = ({ name, version, submodules = [] }) => {
  const [state, setState] = useState(false);

  return (
    <>
      <ListItem disablePadding>
        <AddonData addon={name as string}>
          {({ version: lts, url, loading, download }) => (
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
                  primary={name}
                  secondary={
                    <span style={{ display: 'flex' }}>
                      <span>{version}</span>
                      <span style={{ width: 5 }} />
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        (
                        {loading ? (
                          <span>{version} </span>
                        ) : lts ? (
                          `${lts}`
                        ) : null}
                        {' latest'})
                      </span>
                    </span>
                  }
                />
              </ListItemButton>
              {url ? (
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
              <ListItemText primary={s.name} secondary={s.version} />
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
          {items.map(({ name, version, submodules }) => (
            <React.Fragment key={name}>
              <Item name={name} version={version} submodules={submodules} />
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
