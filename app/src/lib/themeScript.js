// Setzt das gewählte Licht vor dem ersten Zeichnen (kein Aufblitzen).
// Eigene Datei, weil next.config.js daraus den Hash für die Content-Security-Policy berechnet.
exports.THEME_SCRIPT = `try{if(localStorage.getItem('stammbaum:licht')==='night')document.documentElement.dataset.theme='night'}catch(e){}`
