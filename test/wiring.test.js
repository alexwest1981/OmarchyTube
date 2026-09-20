// Kontraktet mellan de tre leden: rutnätet (sidan) -> bryggan (preload) -> huvudet.
//
// Mätt 2026-09-19: rutnätet anropade omarchyBridge.browseSearch medan bryggan
// bara erbjöd search — appen hade fällt på det, utan ett ljud. Provet jämför
// anropen med det som faktiskt exponeras.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const page = ['browse.js', 'browse.html'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const preload = fs.readFileSync(path.join(SRC, 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');

test('varje anrop från rutnätet finns i bryggan', () => {
    const calls = [...new Set([...page.matchAll(/omarchyBridge\.(\w+)/g)].map((m) => m[1]))];
    assert.ok(calls.length > 0, 'hittade inga anrop — då vore provet teater');
    for (const call of calls) {
        assert.ok(new RegExp(`${call}\\s*:`).test(preload), `bryggan saknar ${call} (rutnätet anropar den)`);
    }
});

test('varje bryggmetod har en mottagare i huvudet', () => {
    const exposed = [...preload.matchAll(/^\s+(\w+):\s*\(/gm)].map((m) => m[1]);
    assert.ok(exposed.length > 0, 'hittade inga bryggmetoder — då vore provet teater');
    for (const name of exposed) {
        assert.match(main, new RegExp(`ipcMain\\.handle\\(\\s*'[^']+'`), 'huvudet registrerar kanaler');
    }
    const channels = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]);
    for (const channel of channels) {
        assert.ok(main.includes(`ipcMain.handle('${channel}'`), `huvudet saknar kanalen ${channel}`);
    }
});

// 2. huvudprocessen skall gå att starta utan skärm: Electron byts mot en attrapp.
test('huvudprocessen laddar och skapar ett fönster (Electron-attrapp)', () => {
    const Module = require('node:module');
    const original = Module._load;
    const created = [];
    class FakeWindow {
        constructor(options) { this.options = options; created.push(this); this.webContents = { on() {} }; }
        loadFile(file) { this.file = file; }
        getSize() { return [1600, 900]; }
        isFullScreen() { return this.options.fullscreen === true; }
        setFullScreen() {}
        on() {}
    }
    const fake = {
        app: {
            setPath() {},
            getPath: () => '/tmp',
            requestSingleInstanceLock: () => true,
            whenReady: () => ({ then: (fn) => { fn(); return { catch() {} }; } }),
            on() {},
            quit() {},
        },
        BrowserWindow: FakeWindow,
        ipcMain: { handle: (channel) => created.push(channel) },
        contextBridge: { exposeInMainWorld: (name, api) => { created.push({ name, api }); } },
        ipcRenderer: { invoke: () => {} },
        net: { fetch: async () => ({ ok: true, json: async () => ({}) }) },
    };
    Module._load = (request, ...rest) => (request === 'electron' ? fake : original.call(Module, request, ...rest));
    try {
        delete require.cache[require.resolve(path.join(SRC, 'main.js'))];
        require(path.join(SRC, 'main.js'));
    } finally {
        Module._load = original;
    }
    const win = created.find((entry) => entry instanceof FakeWindow);
    assert.ok(win, 'inget fönster skapades');
    assert.strictEqual(win.options.fullscreen, true, 'fönstret skall begära fullskärm (Hyprland tilar annars)');
    assert.ok(String(win.file).endsWith('browse.html'), `fel sida laddades: ${win.file}`);
    for (const channel of ['search', 'play']) assert.ok(created.includes(channel), `kanalen ${channel} registrerades inte`);
});
