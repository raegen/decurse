const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const http = require('http');

const download = (url, dest) => new Promise((resolve) => http.get(url, (response) => {
    const fileName = 'tmp.zip';
    console.log(fileName);
    const file = fs.createWriteStream(path.join(dest, fileName));
    response.pipe(file);
    file.on('finish', () => file.close(() => resolve(fileName)));
}))

const INTERFACE_PATH = '/Users/raegen/dev/decurse/interface';
const ADDONS_PATH = `${INTERFACE_PATH}/addons`;

const unzip = async (source) => extract(source, { dir: ADDONS_PATH }).then(() => {
    console.log('complete unzip');
});

// const INSTALLED = Promise.all(fs.readdirSync(ADDONS_PATH, {withFileTypes: true}).filter((f) => f.isDirectory()).map(({name}) => {
//     const infoPath = path.join(ADDONS_PATH, name, 'decurse.json');
//     if (fs.existsSync(infoPath)) {
//         return Promise.resolve(JSON.parse(fs.readFileSync(infoPath, 'utf8')));
//     } else {
//         const info = JSON.stringify({name, version: fs.statSync(path.join(ADDONS_PATH, name, name + '.toc')).mtime});
//         fs.writeFileSync(infoPath, info)
//         return Promise.resolve(info);
//         // return download(`http://www.curseforge.com/wow/addons/${name}/download`, ADDONS_PATH).then((verName) =>
//         //     unzip(path.join(ADDONS_PATH, verName)).then(() => )
//         // ).then((info) => {
//         //     fs.writeFileSync(infoPath, info)
//         //     return info;
//         // })
//     }
// }))

const createWindow = () => {
    const win = new BrowserWindow({
        webPreferences: {
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
        },
        width: 800,
        height: 600
    })
  
    // win.loadURL('https://www.curseforge.com/wow/addons');
    win.loadFile('./index.html');
    win.webContents.session.on('will-download', (event, item, webContents) => {
        // Set the save path, making Electron not to prompt a save dialog.
        item.setSavePath('/Users/raegen/dev/decurse/' + item.getFilename())
      
        item.on('updated', (event, state) => {
          if (state === 'interrupted') {
            console.log('Download is interrupted but can be resumed')
          } else if (state === 'progressing') {
            if (item.isPaused()) {
              console.log('Download is paused')
            } else {
              console.log(`Received bytes: ${item.getReceivedBytes()}`)
            }
          }
        })
        item.once('done', (event, state) => {
          if (state === 'completed') {
            console.log('Download successfully')
            unzip('/Users/raegen/dev/decurse/' + item.getFilename())
          } else {
            console.log(`Download failed: ${state}`)
          }
        })
      })

    //   INSTALLED.then(console.log);
  }

app.whenReady().then(() => {
    createWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})