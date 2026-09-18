// Prov för arkitekturen Alex bad om: allt i ett fönster.
//
// Mätt skäl: först byggde jag en egen väljarruta, och att välja profil öppnade
// ännu en ruta. Två rutor sida vid sida (Hyprland sida vid sida) gav dessutom
// YouTubes TV-layout i ett smalt fönster, där texten krympte till otydlig.
// Provet pinnar att det bara finns EN fönsterfabrik och att väljaren är en sida
// i den rutan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

test('bara en fönsterfabrik', () => {
    const created = main.match(/new BrowserWindow\(/g) || [];
    assert.strictEqual(created.length, 1, 'fler än en plats skapar fönster: allt skall ske i samma ruta');
    assert.ok(!main.includes('createPickerWindow'), 'väljarrutan är tillbaka');
});

test('väljaren visas i den ruta som redan finns', () => {
    assert.match(main, /function showPicker\(win\)/, 'showPicker saknas');
    assert.match(main, /win\.loadFile\(pickerPage\)/, 'väljaren laddas inte i det aktuella fönstret');
});

test('profilbyte stänger rutan det byts från', () => {
    assert.match(main, /const next = createWindow\(profile\);/, 'profilfönstret skapas inte');
    assert.match(main, /current\.close\(\)/, 'den gamla rutan stängs inte — då blir det två');
});

test("'closed' läser aldrig webContents, som redan är förstörd", () => {
    const closed = main.match(/on\('closed',[\s\S]{0,260}?\}\);/);
    assert.ok(closed, 'hittade ingen closed-hanterare');
    assert.ok(!closed[0].includes('win.webContents.id'),
        'webContents.id läses efter stängning — det kastar "Object has been destroyed"');
    assert.match(main, /const contentsId = win\.webContents\.id;/, 'id:t fångas inte upp före stängningen');
});

test('funktioner tangentbordet kallar ligger på modulnivå', () => {
    // Mätt 2026-09-18: när IPC-blocket flyttades ut ur createWindow följde
    // handleExitVideo med in i registerIpc, och Esc/Backspace svarade
    // "ReferenceError: handleExitVideo is not defined" i stället för att lämna
    // videon. En deklaration inuti en annan funktion syns inte för fönstret.
    const at = (needle) => main.indexOf(needle);
    const ipc = at('function registerIpc()');
    for (const fn of ['handleExitVideo', 'loadBrowse', 'showPicker', 'fitView', 'openProfile']) {
        const declared = at(`function ${fn}(`);
        assert.ok(declared > 0, `${fn} deklareras inte alls`);
        assert.ok(declared < ipc, `${fn} ligger inuti registerIpc och blir osynlig utifrån`);
    }
});
