const { webFrame } = require('electron');
const fs = require('fs');
const path = require('path');

// Only run in top-level frame and strictly on YouTube
if (process.isMainFrame && window.location.hostname.includes('youtube.com')) {
    const stylesPath = path.join(__dirname, 'styles.css');
    const injectorPath = path.join(__dirname, 'injector.js');

    try {
        const cssContent = fs.readFileSync(stylesPath, 'utf8');
        const jsContent = fs.readFileSync(injectorPath, 'utf8');

        // Inject custom styles
        webFrame.insertCSS(cssContent);

        // Inject ReVanced engine into page context
        window.addEventListener('DOMContentLoaded', () => {
            webFrame.executeJavaScript(jsContent).catch((err) => {
                console.error('[OmarchyTube] Fel vid körning av injector:', err);
            });
        });
    } catch (err) {
        console.error('[OmarchyTube] Kunde inte ladda resursfiler i preload:', err);
    }
}
