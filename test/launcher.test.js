// Låser den nya arkitekturen: vår app, YouTubes data, användarens konto.
//
// Proverna biter på det som faktiskt gick sönder: appen skall inte kunna radera
// en session (det var hela inloggningsloopen), inte ladda en YouTube-sida i
// rutnätet, inte kräva att användaren bygger en egen OAuth-app, och spelaren
// skall ha den formatväljare som är mätt fungerande.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const files = () => fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const all = () => files().map(read).join('\n');

test('appen raderar aldrig sessionsdata — det var inloggningsloopen', () => {
    const src = all();
    for (const forbidden of ['clearStorageData', 'cookies.remove', 'cookies.set', 'storageData.remove']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});

// Mätt 2026-09-20: appen satte aldrig userData, så partitionen hamnade i
// Electrons standardkatalog — tre olika TV-tillstånd låg på disk samtidigt
// (~/.config/Electron, ~/.config/OmarchyTube, ~/.config/omarchy-tube) och
// inloggningen tappades varje gång appens namn eller startväg ändrades.
// Det är den buggen det här provet fångar.
test('appens session har ett eget hem, och partitionen är den inloggade', () => {
    assert.match(read('main.js'), /app\.setPath\('userData'/, 'main.js måste sätta userData');
    assert.match(read('account.js'), /const PARTITION = 'persist:omarchy-tube';/, 'partitionen skall vara den inloggade');
    assert.match(read('main.js'), /requestSingleInstanceLock/, 'två instanser delar partition och skriver över varandra');
});

// Mätt 2026-09-20: TV-sessionen sätter inga markörkakor, så "är vi inloggade?"
// svarade nej medan flödet svarade med 12 videor — panelen låg kvar över rutnätet
// och videorna kom bara om man klickade på fliken själv. Samma misstag som
// "vänta på ett kaknamn", på ett nytt ställe.
test('inloggad avgörs av sessionen, inte av kaknamn', () => {
    const main = read('main.js');
    assert.match(main, /ipcMain\.handle\('account',[\s\S]{0,300}?storedSession\(\)/, 'account skall svara ur den sparade sessionen');
    assert.ok(!/ipcMain\.handle\('account', \(\) => account\.accountState/.test(main), 'kakmarkörer får inte avgöra inloggningen');
});

test('inloggningen är ett helskärmsläge, inte en ruta ovanpå rutnätet', () => {
    const css = read('browse.css');
    assert.match(css, /#login:not\(\[hidden\]\) \{[\s\S]{0,200}?position: fixed/, 'panelen skall täcka fönstret — men bara när den inte är dold (display slår hidden-attributet)');
    assert.match(css, /#login-qr\[hidden\] \{ display: none/, 'den dolda QR-bilden fick en trasig bild-ikon i stället för att vara borta');
    assert.match(read('browse.js'), /classList\.add\('signing-in'\)/, 'rutnätet skall vika undan medan man loggar in');
    assert.match(css, /#login:not\(\[hidden\]\) \.kod \{[\s\S]{0,160}?clamp\(/, 'koden skall vara stor nog att läsas på håll');
});

test('Enter skickas som en riktig tangent — syntetiska klick gör ingenting', () => {
    const account = read('account.js');
    assert.match(account, /sendInputEvent\(\{ type: typ, keyCode: typ === 'char'/, 'Enter skall skickas som inmatning');
    assert.ok(!/TRYCK_KONTO|TRYCK_VIDARE/.test(account), 'klick-vägen är mätt död och skall inte tillbaka');
});

test('flushStorageData anropas utan .catch — den är synkron och kastar annars', () => {
    const src = all();
    assert.ok(!/flushStorageData\(\)\s*\n?\s*\.catch/.test(src), 'flushStorageData().catch(...) kastar: den returnerar ingenting');
});

test('sessionen skrivs till disk, annars börjar nästa start om', () => {
    assert.match(read('account.js'), /flushStorageData/, 'dörren skall skriva sessionen till disk när kontot syns');
    assert.match(read('main.js'), /flushStorageData/, 'appen skall skriva sessionen till disk innan den avslutas');
});

test('bara dörren laddar en YouTube-adress, och bara TV-appens sida', () => {
    const loaded = [...all().matchAll(/loadURL\(([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    assert.deepStrictEqual(loaded, ['DOOR_URL'], `bara dörrens adress får laddas, hittade: ${loaded.join(', ')}`);
    assert.match(read('account.js'), /youtube\.com\/tv/, 'dörren skall vara TV-appens sida');
});

test('ingen injektion — enda undantaget är att läsa dörrens egen lagring', () => {
    assert.ok(!all().includes('insertCSS'), 'insertCSS får inte finnas i src/');
    for (const file of files()) {
        if (file === 'account.js') continue;   // dörren får läsa sin egen sida
        assert.ok(!read(file).includes('executeJavaScript'), `executeJavaScript får inte finnas i ${file}`);
    }
    const door = read('account.js');
    assert.ok(!/executeJavaScript\([^)]*[`'"][^`'"]*\b(set|remove|clear|post|send)\b/i.test(door), 'dörren får bara LÄSA sin sida, inte ändra den');
});

test('kontomarkörerna innehåller LOGIN_INFO — den som saknades', () => {
    assert.match(read('account.js'), /'LOGIN_INFO'/, 'LOGIN_INFO är YouTubes egen kontomarkör');
});

// Mätt 2026-09-20: mpv:s fönster lade sig över rutnätet när man spelade. Standard
// är därför appens eget <video>; mpv startas bara när sidan uttryckligen ber om
// hög kvalitet (H), och bara från playHigh. Ingen webbläsare, någonsin.
test('externa processer: yt-dlp alltid, mpv bara på begäran', () => {
    const spawned = [...all().matchAll(/spawn\(\s*['"]([^']+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(spawned)], ['mpv'], `bara mpv får spawnas, hittade: ${spawned.join(', ')}`);
    const spelare = read('player.js');
    const hög = spelare.slice(spelare.indexOf('function playHigh'), spelare.indexOf('function stopHigh'));
    const standardväg = spelare.slice(spelare.indexOf('function play('), spelare.indexOf('function playHigh'));
    assert.ok(!/mpv/.test(standardväg.replace(/^\s*\/\/.*$/gm, '')), 'standardvägen (play) får inte röra mpv — det var fönstret som inte gick att stänga');
    assert.match(hög, /spawn\('mpv'/, 'mpv hör till hög kvalitet');
    for (const förbjuden of ['xdg-open', 'openurl', 'shell.openExternal']) {
        assert.ok(!all().includes(förbjuden), `${förbjuden} får inte finnas`);
    }
});

test('användaren skall inte behöva bygga en egen OAuth-app', () => {
    const src = all();
    for (const gone of ['apps.googleusercontent.com', 'client_secret', 'GOCSPX']) {
        assert.ok(!src.includes(gone), `${gone} hörde till klientspåret som riven`);
    }
});

// Mätt 2026-09-20: mpv:s eget fönster lade sig över rutnätet och gick inte att
// stänga. Uppspelningen sker nu i appens eget <video>, och strömmen måste vara EN
// fil (ett <video> kan inte para ihop DASH-video med separat ljud).
test('spelaren hämtar EN spelbar fil — ingen extern spelare, inget eget fönster', () => {
    const { FORMAT, args } = require(path.join(SRC, 'player.js'));
    assert.ok(!/\+/.test(FORMAT), `formatet får inte vara två strömmar: ${FORMAT}`);
    assert.match(FORMAT, /ext=mp4/, 'mp4 för att Electron skall kunna spela den');
    const argv = args('https://www.youtube.com/watch?v=x');
    assert.ok(argv.includes('-g'), 'yt-dlp skall bara lämna URL:en');
    assert.ok(argv.includes('--no-playlist'));
    // Klienten som erbjuder den muxade strömmen (mätt: android_vr gav exakt ett
    // format, itag 18; de andra gav 30-41 format och noll muxade).
    assert.ok(argv.includes('youtube:player_client=mweb'), 'fel klient — mweb är den vars muxade ström svarar 206 (android_vr ger 403, mätt)');
    assert.match(read('player.js'), /FORMAT_HÖG = 'bv\*\+ba\/b'/, 'hög kvalitet skall vara DASH-paret, för mpv');
});

test('Esc stänger spelaren och inloggningsläget — inget får fastna överst', () => {
    const src = read('browse.js');
    assert.match(src, /case 'Escape':[\s\S]{0,200}?stängSpelaren\(\)/, 'Esc skall stänga spelaren');
    assert.match(src, /case 'Escape':[\s\S]{0,300}?loginPanel\.hidden = true/, 'Esc skall också stänga inloggningsläget');
    assert.match(src, /if \(state\.items\.length\) return;/, 'inloggningsrutan får inte täcka videor som redan finns');
    assert.match(read('browse.html'), /id="spelare"/, 'spelaren hör till appens eget fönster');
});

test('rutnätet hämtar 1280x720, inte träfflistans 720x404', () => {
    const src = read('browse.js');
    assert.match(src, /i\.ytimg\.com\/vi\/\$\{item\.videoId\}\/hq720\.jpg/, 'miniatyren skall byggas ur video-id:t');
    assert.match(src, /hqdefault\.jpg/, 'sista reserven skall vara hqdefault — äldre videor saknar hq720');
    assert.match(src, /addEventListener\('error'/, 'en trasig bild skall bytas, inte lämna en grå platshållare');
});

test('video-id valideras innan det når mpv', () => {
    assert.match(read('main.js'), /\^\[\\w-\]\{11\}\$/);
});

test('allting sker i appen — ingen extern webbläsare någonstans', () => {
    const src = all();
    for (const forbidden of ['xdg-open', 'browser-launch', 'shell.openExternal']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});
