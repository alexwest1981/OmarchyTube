const { webFrame, ipcRenderer, contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

// Expose bridge for quick exit and controls
try {
    contextBridge.exposeInMainWorld('omarchyBridge', {
        exitVideo: () => ipcRenderer.send('omarchy-exit-video')
    });
} catch (err) {
    console.error('[OmarchyTube] Preload bridge error:', err);
}

// Only run in top-level frame
if (process.isMainFrame) {
    const stylesPath = path.join(__dirname, 'styles.css');
    const injectorPath = path.join(__dirname, 'injector.js');

    try {
        if (fs.existsSync(stylesPath)) {
            const cssContent = fs.readFileSync(stylesPath, 'utf8');
            webFrame.insertCSS(cssContent);
        }
        if (fs.existsSync(injectorPath)) {
            const jsContent = fs.readFileSync(injectorPath, 'utf8');
            const runInjector = () => {
                webFrame.executeJavaScript(jsContent).catch((err) => {
                    console.error('[OmarchyTube] Fel vid körning av injector:', err);
                });
            };

            if (document.readyState === 'loading') {
                window.addEventListener('DOMContentLoaded', runInjector);
            } else {
                runInjector();
            }
        }
    } catch (err) {
        console.error('[OmarchyTube] Preload read error:', err);
    }
}
