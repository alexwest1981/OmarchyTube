// Vem skall titta? — profilerna bakom första skärmen.
//
// En profil är en Google-session: varje profil får sin egen partition, så
// flödet, prenumerationerna, historiken och spellistorna är det kontots egna.
// Filen ligger i userData/profiles.json; den här modulen formar bara listan och
// rör inte electron eller skärmen, så npm test kommer åt varje regel.
const fs = require('fs');

// Samma sex färger som YouTube använder till profilbilder, i deras ordning.
const PALETTE = ['#e5484d', '#e5a13d', '#4ec9a0', '#3d8be5', '#a86fe5', '#e55c9e'];

function slug(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
}

// Saknad fil betyder "inga profiler än", inte ett fel: första starten skall
// kunna visa en tom skärm utan att något loggas som trasigt. En trasig fil
// behandlas likadant — listan går att bygga på nytt, den är inte data.
function readProfiles(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(parsed) ? parsed.filter((p) => p && p.id) : [];
    } catch (err) {
        return [];
    }
}

function writeProfiles(file, list) {
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
    return list;
}

// Lägger till en profil och ger den ett id som tål att bli ett partition-namn
// (partitionen får inte innehålla vad som helst). Tomt namn avvisas: hellre en
// icke-händelse än en profil som heter "".
function addProfile(list, name) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!clean) return null;

    const base = slug(clean) || 'tittare';
    let id = base;
    for (let n = 2; list.some((p) => p.id === id); n += 1) id = `${base}-${n}`;

    const profile = { id, name: clean, colour: PALETTE[list.length % PALETTE.length] };
    return { profile, list: [...list, profile] };
}

const removeProfile = (list, id) => list.filter((p) => p.id !== id);
const findProfile = (list, id) => list.find((p) => p.id === id) || null;
const partitionFor = (id) => `persist:omarchy-tube-${id}`;
const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

module.exports = { PALETTE, addProfile, findProfile, initialOf, partitionFor, readProfiles, removeProfile, slug, writeProfiles };
