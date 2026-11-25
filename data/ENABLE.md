# ENABLE word list

`data/enable.js` bundles the **ENABLE** word list (Enhanced North American
Benchmark Lexicon, Alan Beale and M. Cooper, 1997), which its authors placed
in the **public domain**. It is reserved for Lexicon Breach (Phase 5 backlog).

- Source: `enable1.txt` from https://github.com/dolph/dictionary (downloaded 2026-11-23)
- sha256 of the source file: `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`
- 172,823 words, lowercase a–z only, sorted and unique (checked at build time)
- Stored as one space-separated string in a classic script so it loads from `file://`

ENABLE is a word-game list: it includes obscure and offensive words, and it
has no category labels. Lexicon Breach will still need its own category
lists and a blocklist for anything shown on screen as a prompt or example.

API: `WW.lexicon.has(word)` (case-insensitive), `WW.lexicon.list()`, `WW.lexicon.count`.
Only pages that need it should load the script (about 1.7 MB).
