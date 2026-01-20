import { ipcMain, app, BrowserWindow, shell, Menu } from "electron";
import { join } from "path";
import { createXNetClient } from "@xnet/sdk";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class SQLiteAdapter {
  db;
  constructor(path) {
    this.db = new Database(path);
  }
  async open() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content BLOB,
        metadata TEXT,
        version INTEGER
      );

      CREATE TABLE IF NOT EXISTS updates (
        doc_id TEXT,
        update_hash TEXT,
        update_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (doc_id, update_hash)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        doc_id TEXT PRIMARY KEY,
        snapshot_data TEXT
      );

      CREATE TABLE IF NOT EXISTS blobs (
        cid TEXT PRIMARY KEY,
        data BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
    `);
  }
  async close() {
    this.db.close();
  }
  async clear() {
    this.db.exec("DELETE FROM documents; DELETE FROM updates; DELETE FROM snapshots; DELETE FROM blobs;");
  }
  async getDocument(id) {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      content: new Uint8Array(row.content),
      metadata: JSON.parse(row.metadata),
      version: row.version
    };
  }
  async setDocument(id, data) {
    this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, content, metadata, version)
      VALUES (?, ?, ?, ?)
    `).run(id, Buffer.from(data.content), JSON.stringify(data.metadata), data.version);
  }
  async deleteDocument(id) {
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM updates WHERE doc_id = ?").run(id);
    this.db.prepare("DELETE FROM snapshots WHERE doc_id = ?").run(id);
  }
  async listDocuments(prefix) {
    const rows = prefix ? this.db.prepare("SELECT id FROM documents WHERE id LIKE ?").all(`${prefix}%`) : this.db.prepare("SELECT id FROM documents").all();
    return rows.map((r) => r.id);
  }
  async appendUpdate(docId, update) {
    this.db.prepare(`
      INSERT OR IGNORE INTO updates (doc_id, update_hash, update_data)
      VALUES (?, ?, ?)
    `).run(docId, update.updateHash, JSON.stringify(update));
  }
  async getUpdates(docId, _since) {
    const rows = this.db.prepare(
      "SELECT update_data FROM updates WHERE doc_id = ? ORDER BY created_at ASC"
    ).all(docId);
    return rows.map((r) => JSON.parse(r.update_data));
  }
  async getUpdateCount(docId) {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM updates WHERE doc_id = ?"
    ).get(docId);
    return row.count;
  }
  async getSnapshot(docId) {
    const row = this.db.prepare(
      "SELECT snapshot_data FROM snapshots WHERE doc_id = ?"
    ).get(docId);
    if (!row) return null;
    return JSON.parse(row.snapshot_data);
  }
  async setSnapshot(docId, snapshot) {
    this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (doc_id, snapshot_data)
      VALUES (?, ?)
    `).run(docId, JSON.stringify(snapshot));
  }
  async getBlob(cid) {
    const row = this.db.prepare("SELECT data FROM blobs WHERE cid = ?").get(cid);
    return row ? new Uint8Array(row.data) : null;
  }
  async setBlob(cid, data) {
    this.db.prepare("INSERT OR REPLACE INTO blobs (cid, data) VALUES (?, ?)").run(cid, Buffer.from(data));
  }
  async hasBlob(cid) {
    const row = this.db.prepare("SELECT 1 FROM blobs WHERE cid = ?").get(cid);
    return !!row;
  }
}
let client = null;
function setupIPC() {
  ipcMain.handle("xnet:init", async () => {
    if (client) return { did: client.identity.did };
    const dataPath = join(app.getPath("userData"), "xnet-data");
    try {
      mkdirSync(dataPath, { recursive: true });
    } catch {
    }
    const storage = new SQLiteAdapter(join(dataPath, "xnet.db"));
    client = await createXNetClient({
      storage,
      enableNetwork: false
      // Disabled for now until network is stable
    });
    await client.start();
    return { did: client.identity.did };
  });
  ipcMain.handle("xnet:createDocument", async (_, options) => {
    if (!client) throw new Error("Client not initialized");
    const doc = await client.createDocument(options);
    return { id: doc.id, title: doc.metadata.title };
  });
  ipcMain.handle("xnet:getDocument", async (_, id) => {
    if (!client) throw new Error("Client not initialized");
    const doc = await client.getDocument(id);
    if (!doc) return null;
    return {
      id: doc.id,
      type: doc.type,
      workspace: doc.workspace,
      title: doc.metadata.title,
      content: doc.ydoc.getText("content").toString()
    };
  });
  ipcMain.handle("xnet:listDocuments", async (_, workspace) => {
    if (!client) throw new Error("Client not initialized");
    return client.listDocuments(workspace);
  });
  ipcMain.handle("xnet:deleteDocument", async (_, id) => {
    if (!client) throw new Error("Client not initialized");
    await client.deleteDocument(id);
  });
  ipcMain.handle("xnet:query", async (_, query) => {
    if (!client) throw new Error("Client not initialized");
    return client.query(query);
  });
  ipcMain.handle("xnet:search", async (_, text, limit) => {
    if (!client) throw new Error("Client not initialized");
    return client.search(text, limit);
  });
  ipcMain.handle("xnet:getSyncStatus", async () => {
    if (!client) return { status: "offline", peers: [] };
    return {
      status: client.syncStatus,
      peers: client.peers
    };
  });
  ipcMain.handle("xnet:stop", async () => {
    if (client) {
      await client.stop();
      client = null;
    }
  });
}
function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : [],
    {
      label: "File",
      submenu: [
        {
          label: "New Page",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:new-page");
          }
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [
          { type: "separator" },
          { role: "front" }
        ] : [
          { role: "close" }
        ]
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Documentation",
          click: async () => {
            await shell.openExternal("https://github.com/xnet-io/xnet");
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
let mainWindow = null;
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(async () => {
  setupIPC();
  createMenu();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
