# Vendored text recognition (OCR) for local document reading

Used by `wealth-analyzer.html` to read scanned PDFs and photos **on the user's device**
(Upload Document and Read a statement, in local mode). Loaded only when a scan is read,
from this folder next to the page; a copy of the app opened from a file loads the same
pinned version from jsDelivr instead. Only the engine is downloaded: images never leave
the device.

| File | Source | Version | Licence |
|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | npm `tesseract.js` (`dist/`) | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js.md`) |
| `core/tesseract-core-simd-lstm.wasm.js`, `core/tesseract-core-lstm.wasm.js` | npm `tesseract.js-core` | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js-core.txt`) |
| `lang/{eng,deu,fra,ita}.traineddata.gz` | npm `@tesseract.js-data/<lang>`, folder `4.0.0_best_int` | 1.0.0 | Tesseract `tessdata_best` models, Apache-2.0; packaged under MIT |

The app picks the SIMD core when the browser supports WebAssembly SIMD (every current
browser) and the plain core otherwise. English, German, French and Italian are loaded
together, for Swiss and international documents.

To update: `npm pack tesseract.js@<v> tesseract.js-core@<v> @tesseract.js-data/{eng,deu,fra,ita}`,
copy the same files, and change `WA_OCR_VER` in `wealth-analyzer.html` (also used for the
jsDelivr fallback and the browser cache name).
