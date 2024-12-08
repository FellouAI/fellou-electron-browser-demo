const { ipcRenderer } = require('electron');
const { useEffect, useState } = require('react');

const noop = () => {};

function useConnect(options = {}) {
  const { onTabsUpdate = noop, onTabActive = noop } = options;
  const [tabs, setTabs] = useState({});
  const [tabIDs, setTabIDs] = useState([]);
  const [activeID, setActiveID] = useState(null);

  const channels = [
    [
      'tabs-update',
      (e, v) => {
        setTabIDs(v.tabs);
        setTabs(v.confs);
        onTabsUpdate(v);
      }
    ],
    [
      'active-update',
      (e, v) => {
        setActiveID(v);
        const activeTab = tabs[v] || {};
        onTabActive(activeTab);
      }
    ]
  ];

  useEffect(() => {
    ipcRenderer.send('control-ready');
    channels.forEach(([name, listener]) => ipcRenderer.on(name, listener));
    return () => {
      channels.forEach(([name, listener]) => ipcRenderer.removeListener(name, listener));
    };
  }, []);

  return { tabIDs, tabs, activeID };
}

const sendEnterURL = url => ipcRenderer.send('url-enter', url);
const sendChangeURL = url => ipcRenderer.send('url-change', url);
const sendAct = actName => ipcRenderer.send('act', actName);
const sendGoBack = () => sendAct('goBack');
const sendGoForward = () => sendAct('goForward');
const sendReload = () => sendAct('reload');
const sendStop = () => sendAct('stop');
const sendCloseTab = id => ipcRenderer.send('close-tab', id);
const sendNewTab = (url, references) => ipcRenderer.send('new-tab', url, references);
const sendSwitchTab = id => ipcRenderer.send('switch-tab', id);

exports.useConnect = useConnect;
exports.sendEnterURL = sendEnterURL;
exports.sendChangeURL = sendChangeURL;
exports.sendGoBack = sendGoBack;
exports.sendGoForward = sendGoForward;
exports.sendReload = sendReload;
exports.sendStop = sendStop;
exports.sendNewTab = sendNewTab;
exports.sendSwitchTab = sendSwitchTab;
exports.sendCloseTab = sendCloseTab;
