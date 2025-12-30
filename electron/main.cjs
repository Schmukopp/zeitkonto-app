/* electron/main.cjs */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
    win.loadURL(devUrl);
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    win.loadFile(indexHtml);
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:getVersion", () => app.getVersion());
