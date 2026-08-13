const { app, BrowserWindow, session } = require('electron');
const path = require('path');

/**
 * Create the main application window.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Finger Gundown',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      contextIsolation: true,
      // Allow loading local WASM files (MediaPipe models) from file:// origins
      webSecurity: false,
    },
  });

  // Load the Vite production build via file:// protocol
  win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Remove the default menu bar (optional, gives a cleaner game feel)
  win.setMenuBarVisibility(false);
}

/**
 * Automatically grant camera & microphone permissions when requested.
 * This prevents the browser-style permission popup from blocking the app.
 */
app.whenReady().then(() => {
  // Grant media device permissions without user prompt
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const grantedPermissions = ['media', 'camera', 'microphone'];
      if (grantedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (Windows / Linux behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
