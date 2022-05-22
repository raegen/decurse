/* eslint import/prefer-default-export: off, import/no-mutable-exports: off */
import { URL } from 'url';
import path from 'path';
import fs from 'fs';

export let resolveHtmlPath: (htmlFileName: string) => string;

if (process.env.NODE_ENV === 'development') {
  const port = process.env.PORT || 1212;
  resolveHtmlPath = (htmlFileName: string) => {
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  };
} else {
  resolveHtmlPath = (htmlFileName: string) => {
    return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
  };
}

export const INTERFACE_PATH = [
  '/Program Files (x86)/World of Warcraft/_retail_/Interface',
  '/Applications/World of Warcraft/_retail_/Interface',
].find(fs.existsSync);
export const ADDONS_PATH = `${INTERFACE_PATH}/AddOns`;

export interface Addon {
  name: string;
  title: string;
  version: string;
  submodule: boolean;
  parent?: string;
  submodules?: Addon[];
}
