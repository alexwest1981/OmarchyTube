// Profilväljarens sida: ritar listan och skickar valet vidare.
//
// Reglerna för listan bor i main-processen (src/profiles.js) och kommandot som
// startar webbläsaren i src/browser-launch.js — den här filen ritar bara.
//
// IIFE för ett mätt skäl: en sida som laddar fler än ett klassiskt skript delar
// global skopa, och ett toppnamn för mycket dödar den andra filen utan att något
// syns (det hände med rutnätet 2026-09-18).
(function () {
    const bridge = window.omarchyBridge && window.omarchyBridge.profiles;
    const people = document.getElementById('people');
    const status = document.getElementById('status');
    const form = document.getElementById('add');
    const nameInput = document.getElementById('name');

    let profiles = [];
    let index = 0;
    let confirmingRemoval = null;
    let mode = 'desktop';

    if (!bridge) {
        status.textContent = 'Bryggan saknas — fönstret kördes utanför appen.';
        return;
    }

    const say = (text) => { status.textContent = text || ''; };
    const modeWord = () => (mode === 'tv' ? 'TV-läge' : 'skrivbordsläge');

    function tile(profile, position) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'person';
        button.dataset.id = profile.id;
        button.setAttribute('aria-current', String(position === index));
        if (confirmingRemoval === profile.id) button.dataset.confirm = 'true';

        const face = document.createElement('span');
        face.className = 'face';
        if (profile.colour) face.style.background = profile.colour;
        face.textContent = profile.name.trim().charAt(0).toUpperCase() || '?';

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = profile.name;

        button.append(face, label);
        button.addEventListener('click', () => { index = position; choose(); });
        item.append(button);
        return item;
    }

    function addTile() {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'person add';
        button.setAttribute('aria-current', String(!profiles.length || index === profiles.length));

        const face = document.createElement('span');
        face.className = 'face';
        face.textContent = '+';

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = 'Lägg till konto';

        button.append(face, label);
        button.addEventListener('click', openForm);
        item.append(button);
        return item;
    }

    function render() {
        people.replaceChildren();
        profiles.forEach((profile, position) => people.append(tile(profile, position)));
        people.append(addTile());
    }

    function choose() {
        const profile = profiles[index];
        if (!profile) {
            openForm();
            return;
        }
        say(`Öppnar ${profile.name} i appen …`);
        bridge.pick(profile.id).then((result) => {
            if (result && result.message) say(result.message);
            // Misslyckades starten står rutan kvar med orsaken i stället för att
            // stänga sig och se ut som om ingenting hände.
        });
    }

    function openForm() {
        form.hidden = false;
        nameInput.value = '';
        nameInput.focus();
        say('');
    }

    function closeForm() {
        form.hidden = true;
        nameInput.blur();
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
            say('Profilen behöver ett namn.');
            return;
        }
        profiles = await bridge.add(name);
        index = profiles.length - 1;
        closeForm();
        render();
        say(`${profiles[index].name} tillagd. Enter öppnar ett eget webbläsarfönster där du loggar in.`);
    });

    document.getElementById('cancel').addEventListener('click', closeForm);

    document.addEventListener('keydown', (event) => {
        if (!form.hidden) {
            if (event.key === 'Escape') { closeForm(); event.preventDefault(); }
            return;
        }

        if (event.key === 'F2') {
            // Skrivbordsläge är standard; TV-läget vill ha en bred skärm.
            bridge.mode(mode === 'tv' ? 'desktop' : 'tv').then((next) => {
                mode = next;
                say(`${modeWord()} — Enter öppnar ${profiles[index] ? profiles[index].name : 'profilen'}.`);
            });
            event.preventDefault();
            return;
        }

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            index = Math.min(index + 1, profiles.length);
            confirmingRemoval = null;
            render();
            event.preventDefault();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            index = Math.max(index - 1, 0);
            confirmingRemoval = null;
            render();
            event.preventDefault();
        }
        if (event.key === 'Enter') {
            choose();
            event.preventDefault();
        }
        if (event.key === 'Escape') {
            // Rutan kan redan visa en profil (F3 hit); Esc är vägen tillbaka.
            bridge.current().then((id) => { if (id) bridge.pick(id); });
            event.preventDefault();
        }
        if (event.key.toLowerCase() === 'n') {
            openForm();
            event.preventDefault();
        }
        if (event.key === 'Delete' && profiles[index]) {
            if (confirmingRemoval === profiles[index].id) {
                const gone = profiles[index].name;
                bridge.remove(profiles[index].id).then((list) => {
                    profiles = list;
                    index = Math.min(index, Math.max(profiles.length - 1, 0));
                    confirmingRemoval = null;
                    render();
                    say(`${gone} borttagen. (Kontot ligger kvar i sin webbläsarkatalog — ta bort mappen om den också skall bort.)`);
                });
            } else {
                confirmingRemoval = profiles[index].id;
                render();
                say(`Tryck Delete en gång till för att ta bort ${profiles[index].name}.`);
            }
            event.preventDefault();
        }
    });

    bridge.mode().then((next) => { mode = next; });
    bridge.list().then((list) => {
        profiles = list;
        index = 0;
        render();
        say(profiles.length
            ? 'Välj profil — Enter öppnar den här rutan på den profilens YouTube.'
            : 'Ingen profil än: N eller klick lägger till den första.');
    });
})();
