// Läuft als Web Worker: Die Layout-Berechnung blockiert so nie die Oberfläche.
// elk-worker registriert sich beim Laden selbst als Worker (Nachrichtenprotokoll von ELK).
import 'elkjs/lib/elk-worker.min.js'
