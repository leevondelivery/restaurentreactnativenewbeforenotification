const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Disable autoplay restrictions so order alert sound plays without requiring user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function startLocalServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0].split('#')[0];
      const safeSuffix = path.normalize(cleanUrl).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(distDir, safeSuffix);

      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(filePath).pipe(res);
        } else {
          // SPA fallback: return index.html for client-side routing (/home, /orders, /tracker, etc.)
          const indexPath = path.join(distDir, 'index.html');
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(indexPath).pipe(res);
        }
      });
    });

    server.on('error', reject);

    // Listen on 127.0.0.1 on an available port assigned by the OS
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

let mainWindow = null;
let localServer = null;

async function createWindow() {
  const distDir = fs.existsSync(path.join(__dirname, 'dist'))
    ? path.join(__dirname, 'dist')
    : path.join(__dirname, '../dist');

  const iconPath = fs.existsSync(path.join(__dirname, 'icon.ico'))
    ? path.join(__dirname, 'icon.ico')
    : path.join(__dirname, '../assets/images/icon.ico');

  try {
    const { server, port } = await startLocalServer(distDir);
    localServer = server;

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 900,
      minHeight: 600,
      title: 'Leevon Restaurant Partner',
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}`);

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    console.error('Failed to start local desktop server:', err);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
