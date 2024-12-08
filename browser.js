import { BrowserWindow, BrowserView, ipcMain } from 'electron';
import EventEmitter from 'events';

export default class TabsBrowserWindow extends EventEmitter {
  constructor(options) {
    super();

    this.options = options;
    const {
      width = 1024,
      height = 800,
      winOptions = {},
      controlPanel,
      controlReferences
    } = options;

    this.win = new BrowserWindow({
      ...winOptions,
      width,
      height
    });

    this.defCurrentViewId = null;
    this.defTabConfigs = {};
    this.views = {};
    this.tabs = [];
    this.ipc = null;

    this.controlView = new BrowserView({
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        webSecurity: false,
        ...controlReferences
      }
    });

    this.win.addBrowserView(this.controlView);
    this.controlView.setBounds(this.getControlBounds());
    this.controlView.setAutoResize({ width: true });
    this.controlView.webContents.loadURL(controlPanel);

    const webContentsAct = actionName => {
      const webContents = this.currentWebContents;
      const action = webContents && webContents[actionName];
      if (typeof action === 'function') {
        if (actionName === 'reload' && webContents.getURL() === '') return;
        action.call(webContents);
      } else {
        console.log('Invalid webContents action ', actionName);
      }
    };

    const channels = Object.entries({
      'control-ready': e => {
        this.ipc = e;

        this.newTab(this.options.startPage || '');
        this.emit('control-ready', e);
      },
      'url-change': (e, url) => {
        this.setTabConfig(this.currentViewId, { url });
      },
      'url-enter': (e, url) => {
        this.loadURL(url);
      },
      act: (e, actName) => webContentsAct(actName),
      'new-tab': (e, url, references) => {
        this.newTab(url, undefined, references);
      },
      'switch-tab': (e, id) => {
        this.switchTab(id);
      },
      'close-tab': (e, id) => {
        if (id === this.currentViewId) {
          const removeIndex = this.tabs.indexOf(id);
          const nextIndex = removeIndex === this.tabs.length - 1 ? 0 : removeIndex + 1;
          this.setCurrentView(this.tabs[nextIndex]);
        }
        this.tabs = this.tabs.filter(v => v !== id);
        this.tabConfigs = {
          ...this.tabConfigs,
          [id]: undefined
        };
        this.destroyView(id);

        if (this.tabs.length === 0) {
          this.newTab();
        }
      }
    });

    channels
      .map(([name, listener]) => [
        name,
        (e, ...args) => {
          if (this.controlView && e.sender === this.controlView.webContents) {
            listener(e, ...args);
          }
        }
      ])
      .forEach(([name, listener]) => ipcMain.on(name, listener));

    this.win.on('closed', () => {
      channels.forEach(([name, listener]) => ipcMain.removeListener(name, listener));

      this.tabs.forEach(id => this.destroyView(id));
      if (this.controlView) {
        this.controlView.webContents.destroy();
        this.controlView = null;
      }
      this.emit('closed');
    });

    if (this.options.debug) {
      this.controlView.webContents.openDevTools({ mode: 'detach' });
    }
  }

  getControlBounds() {
    const contentBounds = this.win.getContentBounds();
    return {
      x: 0,
      y: 0,
      width: contentBounds.width,
      height: this.options.controlHeight || 130
    };
  }

  setContentBounds() {
    const [contentWidth, contentHeight] = this.win.getContentSize();
    const controlBounds = this.getControlBounds();
    if (this.currentView) {
      this.currentView.setBounds({
        x: 0,
        y: controlBounds.y + controlBounds.height,
        width: contentWidth,
        height: contentHeight - controlBounds.height
      });
    }
  }

  get currentView() {
    return this.currentViewId ? this.views[this.currentViewId] : null;
  }

  get currentWebContents() {
    const { webContents } = this.currentView || {};
    return webContents;
  }

  get currentViewId() {
    return this.defCurrentViewId;
  }

  set currentViewId(id) {
    this.defCurrentViewId = id;
    this.setContentBounds();
    if (this.ipc) {
      this.ipc.reply('active-update', id);
    }
  }

  get tabConfigs() {
    return this.defTabConfigs;
  }

  set tabConfigs(v) {
    this.defTabConfigs = v;
    if (this.ipc) {
      this.ipc.reply('tabs-update', {
        confs: v,
        tabs: this.tabs
      });
    }
  }

  setTabConfig(viewId, kv) {
    const tab = this.tabConfigs[viewId];
    const { webContents } = this.views[viewId] || {};
    this.tabConfigs = {
      ...this.tabConfigs,
      [viewId]: {
        ...tab,
        canGoBack: webContents && webContents.canGoBack(),
        canGoForward: webContents && webContents.canGoForward(),
        ...kv
      }
    };
    return this.tabConfigs;
  }

  loadURL(url) {
    const { currentView } = this;
    if (!url || !currentView) return;

    const { id, webContents } = currentView;

    const MARKS = '__IS_INITIALIZED__';
    if (webContents[MARKS]) {
      webContents.loadURL(url);
      return;
    }

    const onNewWindow = (e, newUrl, frameName, disposition, winOptions) => {
      if (!new URL(newUrl).host) {
        return;
      }

      e.preventDefault();

      if (disposition === 'new-window') {
        e.newGuest = new BrowserWindow(winOptions);
      } else if (disposition === 'foreground-tab') {
        this.newTab(newUrl, id);
        e.newGuest = new BrowserWindow({ ...winOptions, show: false });
      } else {
        this.newTab(newUrl, id);
      }
    };

    webContents.on('new-window', this.options.onNewWindow || onNewWindow);

    webContents
      .on('did-start-loading', () => {
        this.setTabConfig(id, { isLoading: true });
      })
      .on('did-start-navigation', (e, href, isInPlace, isMainFrame) => {
        if (isMainFrame) {
          this.setTabConfig(id, { url: href, href });
          this.emit('url-updated', { view: currentView, href });
        }
      })
      .on('will-redirect', (e, href) => {
        this.setTabConfig(id, { url: href, href });
        this.emit('url-updated', { view: currentView, href });
      })
      .on('page-title-updated', (e, title) => {
        this.setTabConfig(id, { title });
      })
      .on('page-favicon-updated', (e, favicons) => {
        this.setTabConfig(id, { favicon: favicons[0] });
      })
      .on('did-stop-loading', () => {
        this.setTabConfig(id, { isLoading: false });
      })
      .on('dom-ready', () => {
        webContents.focus();
      });

    webContents.loadURL(url);
    webContents[MARKS] = true;

    this.setContentBounds();

    if (this.options.debug) {
      webContents.openDevTools({ mode: 'detach' });
    }
  }

  setCurrentView(viewId) {
    if (!viewId) return;
    this.win.removeBrowserView(this.currentView);
    this.win.addBrowserView(this.views[viewId]);
    this.currentViewId = viewId;
  }

  newTab(url, appendTo, references) {
    const view = new BrowserView({
      webPreferences: {
        // sandbox: true,
        ...(references || this.options.viewReferences)
      }
    });

    view.id = view.webContents.id;

    if (appendTo) {
      const prevIndex = this.tabs.indexOf(appendTo);
      this.tabs.splice(prevIndex + 1, 0, view.id);
    } else {
      this.tabs.push(view.id);
    }
    this.views[view.id] = view;

    const lastView = this.currentView;
    this.setCurrentView(view.id);
    view.setAutoResize({ width: true, height: true });
    this.loadURL(url || this.options.blankPage);
    this.setTabConfig(view.id, {
      title: this.options.blankTitle || 'about:blank'
    });
    this.emit('new-tab', view, { openedURL: url, lastView });
    return view;
  }

  switchTab(viewId) {
    this.setCurrentView(viewId);
    this.currentView.webContents.focus();
  }

  destroyView(viewId) {
    const view = this.views[viewId];
    if (view) {
      view.webContents.destroy();
      this.views[viewId] = undefined;
    }
  }
}
