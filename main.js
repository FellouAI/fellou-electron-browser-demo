import { app } from 'electron';
import fileUrl from 'file-url';
import TabsBrowserWindow from './browser.js';

var browser;

function createWindow() {
  browser = new TabsBrowserWindow({
    controlHeight: 99,
    controlPanel: fileUrl(app.getAppPath() + '/tabs/index.html'),
    startPage: 'https://google.com',
    blankTitle: 'New tab',
    debug: false,
    winOptions: process.platform === 'darwin' ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: {x: 15, y: 15}
    } : {},
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      nodeIntegrationInWorker: true,
      experimentalFeatures: true
    }
  });

  browser.once('ready-to-show', () => {
    browser.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorDescription);
    });
  });

  browser.on('closed', () => {
    browser = null;
  });
}

app.on('ready', async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error('Error creating window:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (browser === null) {
    createWindow();
  }
});
