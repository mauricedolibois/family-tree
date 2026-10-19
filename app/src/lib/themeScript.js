// Applies the chosen theme before the first paint to avoid a flash.
// Kept in its own file because next.config.js hashes it for the Content-Security-Policy.
exports.THEME_SCRIPT = `try{if(localStorage.getItem('stammbaum:licht')==='night')document.documentElement.dataset.theme='night'}catch(e){}`
