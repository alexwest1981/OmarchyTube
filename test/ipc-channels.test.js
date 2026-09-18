// Bryggan och huvudprocessen måste tala om samma kanaler. Efter rivningen
// 2026-09-18 går allt över invoke/handle — ingenting skickas enkelriktat.
//
// Mätt skäl: fönstret per profil gjorde att registreringen flyttades ut i
// registerIpc(), och en kanal som byter namn på ena sidan fångas inte av något
// annat prov — felet syns först när någon klickar. Det här provet läser båda
// filerna och jämför namnen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

// invoke/send i preload hör ihop med handle/on i main.
const calls = (source, method) => [...source.matchAll(new RegExp(`ipcRenderer\\.${method}\\(\\s*'([^']+)'`, 'g'))].map((m) => m[1]);
const handlers = (source, method) => [...source.matchAll(new RegExp(`ipcMain\\.${method}\\(\\s*'([^']+)'`, 'g'))].map((m) => m[1]);

test('varje invoke i preload har en handle i main', () => {
    const invoked = calls(read('preload.js'), 'invoke');
    const handled = handlers(read('main.js'), 'handle');
    assert.ok(invoked.length > 0, 'hittade inga invoke-anrop');
    assert.deepStrictEqual(invoked.filter((c) => !handled.includes(c)), []);
});

test('ingen kanal registreras två gånger i main', () => {
    const source = read('main.js');
    const all = [...handlers(source, 'handle'), ...handlers(source, 'on')];
    assert.strictEqual(new Set(all).size, all.length, 'dubbel registrering: ' + all.join(', '));
});
