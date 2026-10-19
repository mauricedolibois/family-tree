// Runs as a web worker so the layout never blocks the UI.
// elk-worker registers itself on load and speaks ELK's message protocol.
import 'elkjs/lib/elk-worker.min.js'
