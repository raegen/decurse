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
  StyledEngineProvider,
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { Addon } from 'main/util';
import React, { FC, useEffect, useRef, useState } from 'react';
import './App.css';

const Version: FC<{
  addon: string;
  children?: (version: string | null) => React.ReactNode;
}> = ({ addon, children }) => {
  const webViewRef = useRef<WebView>(null);
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const ready = new Promise((resolve) =>
      webViewRef.current?.addEventListener('dom-ready', resolve)
    );
    const loaded = new Promise((resolve) =>
      webViewRef.current?.addEventListener('did-finish-load', resolve)
    );
    ready
      .then(() => loaded)
      .then(() =>
        webViewRef.current?.executeJavaScript(
          `document.querySelector('.project-listing-row a').href`
        )
      )
      .then((url) => webViewRef.current?.loadURL(`${url}/files`))
      .then(() =>
        webViewRef.current?.executeJavaScript<string>(
          `Array.from(document.querySelectorAll('.listing tr td:nth-child(2)')).find((el) => !el.innerText.match(/bcc|classic/))?.innerText`
        )
      )
      .then((lts?: string) => setValue(lts as string))
      .catch(console.log);
  }, [addon]);
  return (
    <>
      <webview
        ref={webViewRef}
        style={{ flex: '0 0 0', width: 0, height: 0 }}
        src={`https://www.curseforge.com/wow/addons/search?search=${addon}`}
      />
      {children ? children(value) : value}
    </>
  );
};

interface WebView extends HTMLWebViewElement {
  executeJavaScript: <T>(code: string) => Promise<T>;
  loadURL: (url: string) => Promise<void>;
}

const Item: FC<Partial<Addon>> = ({ name, version, submodules = [] }) => {
  const [state, setState] = useState(false);

  return (
    <>
      <ListItem>
        {submodules.length ? (
          <ListItemButton
            style={{ flexGrow: 0 }}
            onClick={() => setState(!state)}
          >
            <ListItemIcon style={{ minWidth: 0 }}>
              {state ? <ExpandLess /> : <ExpandMore />}
            </ListItemIcon>
          </ListItemButton>
        ) : null}
        <ListItemButton>
          <ListItemText
            primary={name}
            secondary={
              <Version addon={name as string}>
                {(lts) => (lts ? `${version} (${lts} latest)` : version)}
              </Version>
            }
          />
        </ListItemButton>
      </ListItem>
      <Collapse in={state} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
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
      <Box sx={{ width: '100%', bgcolor: 'background.paper' }}>
        <List>
          {items.map(({ name, version, submodules }) => (
            <Item
              key={name}
              name={name}
              version={version}
              submodules={submodules}
            />
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

export default function App() {
  const [tab, setTab] = useState<number>(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };
  return (
    <StyledEngineProvider injectFirst>
      <div className="view">
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
    </StyledEngineProvider>
  );
}
