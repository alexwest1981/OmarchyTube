// Profilväljarens sida. Håller sig till bryggan (window.omarchyBridge.profiles)
// och ritar; reglerna för listan bor i main-processen (src/profiles.js).
//
// IIFE för samma mätta skäl som signed-out.js: en sida som laddar fler än ett
// klassiskt skript delar global skopa, och ett toppnamn för mycket dödar then
// andra filen utan att något syns.
(function () {
    const bridge = window.omarchyBridge && window.omarchyBridge.profiles;
    const people = document.getElementById('people');
    const status = document.getElementById('status');
    const form = document.getElementById('add');
    const nameInput = document.getElementById('name');

    let profiles = [];
    let index = 0;
    let confirmingRemoval = null;

    if (!bridge) {
        status.textContent = 'Bryggan saknas — fönstret kördes utanför appen.';
        return;
    }

    function say(text) {
        status.textContent = text || '';
    }

    function render() {
        people.replaceChildren();

        profiles.forEach((profile, position) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'person';
            button.dataset.id = profile.id;
            button.setAttribute('aria-current', String(position === index));
            if (confirmingRemoval === profile.id) button.dataset.confirm = 'true';

            const face = document.createElement('span');
            face.className = 'face';
            face.style.background = profile.colour;
            face.textContent = profile.name.trim().charAt(0).toUpperCase();

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = profile.name;

            button.append(face, label);
            button.addEventListener('click', () => { index = position; choose(); });
            item.append(button);
            people.append(item);
        });

        if (!profiles.length) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'person add';
            button.setAttribute('aria-current', 'true');
            const face = document.createElement('span');
            face.className = 'face';
            face.textContent = '+';
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = 'Lägg till konto';
            button.append(face, label);
            button.addEventListener('click', openForm);
            item.append(button);
            people.append(item);
        } else {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'person add';
            button.setAttribute('aria-current', String(index === profiles.length));
            const face = document.createElement('span');
            face.className = 'face';
            face.textContent = '+';
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = 'Lägg till konto';
            button.append(face, label);
            button.addEventListener('click', openForm);
            item.append(button);
            people.append(item);
        }
    }

    async function choose() {
        const profile = profiles[index];
        if (!profile) {
            openForm();
            return;
        }
        say(`Öppnar ${profile.name} …`);
        await bridge.pick(profile.id);
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
        say(`${profiles[index].name} tillagd — Enter öppnar kontot för inloggning.`);
    });

    document.getElementById('cancel').addEventListener('click', closeForm);

    document.addEventListener('keydown', (event) => {
        if (!form.hidden) {
            if (event.key === 'Escape') { closeForm(); event.preventDefault(); }
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
        if (event.key === 'Enter') { choose(); event.preventDefault(); }
        if (event.key.toLowerCase() === 'n') { openForm(); event.preventDefault(); }
        if (event.key === 'Delete' && profiles[index]) {
            if (confirmingRemoval === profiles[index].id) {
                const gone = profiles[index].name;
                bridge.remove(profiles[index].id).then((list) => {
                    profiles = list;
                    index = Math.min(index, Math.max(profiles.length - 1, 0));
                    confirmingRemoval = null;
                    render();
                    say(`${gone} borttagen.`);
                });
            } else {
                confirmingRemoval = profiles[index].id;
                render();
                say(`Tryck Delete en gång till för att ta bort ${profiles[index].name}.`);
            }
            event.preventDefault();
        }
    });

    bridge.list().then((list) => {
        profiles = list;
        index = 0;
        render();
        say(profiles.length
            ? 'Välj profil — Enter öppnar.'
            : 'Ingen profil än: N eller klick lägger till den första.');
    });
})();
