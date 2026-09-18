// Zoom — hur många videokort som får plats i rutan.
//
// Appen har EN skalning, och den rör bara ytan: ingen CSS och ingen JavaScript in
// i YouTubes sidor. Zoomen är webbläsarens egen vy-inställning (samma sak som
// Ctrl+- i en webbläsare), inte ett ingrepp i deras layout.
//
// MÄTT 2026-09-18: två mekanismer samtidigt biter inte. setZoomLevel(0) betyder
// 100 % och nollställde setZoomFactor(0.49) i nästa andetag — loggen skrev
// avsikten medan sidan stod kvar på zoom 1, och slutsatsen "zoom fungerar inte på
// Wayland" var fel. Här finns därför bara setZoomFactor, och mätraden skriver
// getZoomFactor() — resultatet, inte avsikten.
//
// Skrivbordslayouten är byggd i brytpunkter: zoomar man ut får CSS-ytan plats med
// fler kolumner (1920 px ⇒ 4 kolumner, 2400 px ⇒ 5–6). TV-appens 10-fotslayout är
// byggd i rem mot fönsterbredden, så där ändrar zoom ingenting — den ser likadan ut
// hur man än skalar, och den vägen är bara en inloggningsdörr.
const MIN = 0.5;
const MAX = 1.5;
const DEFAULT = 0.8;
const STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];

function clampZoom(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, Math.round(number * 100) / 100));
}

// 'in' | 'out' | 'reset'. Kliver i STEPS så att stegen känns likadana varje gång.
function nextZoom(current, direction) {
    const now = clampZoom(current);
    if (direction === 'reset') return DEFAULT;

    let index = STEPS.findIndex((step) => step >= now - 1e-9);
    if (index === -1) index = STEPS.length - 1;
    index += direction === 'in' ? 1 : -1;
    return clampZoom(STEPS[Math.min(STEPS.length - 1, Math.max(0, index))]);
}

module.exports = { DEFAULT, MAX, MIN, STEPS, clampZoom, nextZoom };
