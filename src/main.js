// OmarchyTube — vem skall titta?
//
// Appen gör tre saker och inget mer:
//
//   1. frågar vem som skall titta (profiles.json i userData)
//   2. startar webbläsaren med den profilens egen --user-data-dir
//   3. stänger sig
//
// Varför så litet: kvällen 2026-09-18 byggde vi YouTube inuti appen — eget
// rutnät, injicerad CSS, TV-läge, UA-spoofning, egen inloggning — och det gick
// inte att få bra. Google vägrar lösenordsinloggning i en inbäddad webbläsare
// ("Couldn't sign you in — This browser or app may not be secure"), YouTubes
// TV-app räknar sin textskala ur fönsterbredden och blir oläslig i en tilad ruta
// (mätt: 941 px gav rotfont 5,88 px mot 24 px vid 1920), och Electronns zoom
// blev ett devicePixelRatio på 0,49 — alltså innehållet i en fjärdedel av rutan.
// Allt det där är någon annans problem i en webbläsare och redan löst där. Kvar
// är det som faktiskt var vårt: frågan och sessionsisoleringen.
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { addProfile, findProfile, readProfiles, removeProfile, writeProfiles } = require('./profiles');
const { browserCommand } = require('./browser-launch');

app.name = 'OmarchyTube';
app.setName('OmarchyTube');
if (process.platform === 'linux') {
    app.setDesktopName('OmarchyTube.desktop');
}

const argv = process.argv.slice(2);
const profilesFile = path.join(app.getPath('userData'), 'profiles.json');
const stateFile = path.join(app.getPath('userData'), 'picker-state.json');

function readState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (err) {
        return {};
    }
}

function writeState(patch) {
    try {
        fs.writeFileSync(stateFile, JSON.stringify({ ...readState(), ...patch }, null, 2));
    } catch (err) {
        console.warn('[OmarchyTube] Kunde inte spara läget:', err.message);
    }
}

// Skrivbordsläge är standard: TV-läget vill ha en bred skärm (mätt: YouTubes
// TV-app skalar sin text med kvadraten på fönsterbredden), så det skall vara ett
// val och inte en överraskning.
let mode = argv.includes('--tv') ? 'tv'
    : argv.includes('--desktop') ? 'desktop'
        : (readState().mode || 'desktop');

let mainWindow = null;

// Kvittensen: appen skall inte stå kvar och se ut som en spelare när jobbet är
// gjort. Mätt hos Alex: rutan stod kvar på "Öppnar Alex" medan webbläsaren redan
// var öppnad — alltså såg appen trasig ut när den var klar.
const CLOSE_DELAY_MS = 1200;

function launch(profile) {
    const command = browserCommand(app.getPath('userData'), profile, mode);
    try {
        fs.mkdirSync(command.dir, { recursive: true });
        const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore' });
        child.unref(); // webbläsaren lever vidare när appen stänger sig
    } catch (err) {
        // Utan det här såg en misslyckad start ut som en app som gjorde ingenting:
        // rutan stängde sig och ingen webbläsare kom. Felet skall upp i rutan.
        console.error(`[OmarchyTube] Kunde inte starta ${command.command}:`, err.message);
        return { ok: false, message: `Kunde inte starta ${command.command}: ${err.message}` };
    }

    console.log(`[OmarchyTube] ${profile.name} → ${command.command} (${mode}, ${command.dir})`);
    return { ok: true, message: `Öppnar ${profile.name} i ${command.command} (${mode === 'tv' ? 'TV-läge' : 'skrivbordsläge'}) …` };
}

function createWindow() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 660,
        minWidth: 720,
        minHeight: 520,
        title: 'Vem skall titta? — OmarchyTube',
        backgroundColor: '#0b0b0d',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'profiles.html'));
    mainWindow.on('closed', () => { mainWindow = null; });
    return mainWindow;
}

function registerIpc() {
    ipcMain.handle('omarchy-profiles:list', () => readProfiles(profilesFile));

    ipcMain.handle('omarchy-profiles:add', (_event, name) => {
        const result = addProfile(readProfiles(profilesFile), name);
        if (!result) return readProfiles(profilesFile);
        writeProfiles(profilesFile, result.list);
        console.log(`[OmarchyTube] Profil tillagd: ${result.profile.name} (${result.profile.id})`);
        return result.list;
    });

    ipcMain.handle('omarchy-profiles:remove', (_event, id) => {
        const list = removeProfile(readProfiles(profilesFile), String(id));
        writeProfiles(profilesFile, list);
        console.log(`[OmarchyTube] Profil borttagen: ${id}`);
        return list;
    });

    ipcMain.handle('omarchy-profiles:mode', (_event, next) => {
        if (next === 'tv' || next === 'desktop') {
            mode = next;
            writeState({ mode });
        }
        return mode;
    });

    ipcMain.handle('omarchy-profiles:pick', (_event, id) => {
        const profile = findProfile(readProfiles(profilesFile), String(id));
        if (!profile) return { ok: false, message: 'Profilen finns inte längre.' };

        const result = launch(profile);
        if (!result.ok) return result; // rutan står kvar med felet, inget stängs

        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
            app.quit();
        }, CLOSE_DELAY_MS);
        return result;
    });
}

app.whenReady().then(() => {
    registerIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
