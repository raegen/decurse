const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');

const INTERFACE_PATH = '/Users/raegen/dev/decurse/interface';
const ADDONS_PATH = `${INTERFACE_PATH}/addons`;

const unzip = async (source) => extract(source, { dir: ADDONS_PATH }).then(() => {
    console.log('complete unzip');
});

const INSTALLED = Promise.all(fs.readdirSync(ADDONS_PATH, {withFileTypes: true}).filter((f) => f.isDirectory()).map(({name}) => {
    const infoPath = path.join(ADDONS_PATH, name, 'decurse.json');
    if (fs.existsSync(infoPath)) {
        return Promise.resolve(JSON.parse(fs.readFileSync(infoPath, 'utf8')));
    } else {
        const info = JSON.stringify({name, version: fs.statSync(path.join(ADDONS_PATH, name, name + '.toc')).mtime});
        fs.writeFileSync(infoPath, info)
        return Promise.resolve(info);
    }
}))

window.addEventListener('DOMContentLoaded', () => {
    console.log('LOADED');
    const installed = document.querySelector('#installed');
    installed.innerHTML = '';
    INSTALLED.then((addons) => {
        addons.forEach((addon) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = addon.name + ' - ' + addon.version;
            installed.appendChild(tmp);
        })
    });
  })