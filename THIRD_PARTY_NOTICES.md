# Third-party notices

GeoAtlas is GPL-3.0-only code (see LICENSE). The components and data below keep their own licences.

## Code dependencies (bundled in the web app)

| Package | Version | Licence |
|---|---|---|
| maplibre-gl | 5.x | BSD-3-Clause |
| pmtiles | 4.x | BSD-3-Clause |

Run `npm ls --all` in `app/` for the full transitive list; the licence of each package is in its own `package.json` and `LICENSE` file.

## Data and map services

| Data | Provider | Licence and obligations |
|---|---|---|
| Geologic Litology map service (1:250,000 compilations, status May 2018) | Pusat Survei Geologi (PSG) / Badan Geologi, ESDM | PSG open licence: attribute the source; **do not sell**. Check the original sheet before any technical use. |
| Macrostrat geologic units | Macrostrat | CC BY 4.0. May contain original sources with their own attribution terms. |
| Basemap | OpenStreetMap contributors, OpenFreeMap, OpenMapTiles | ODbL 1.0 (data) and the OpenMapTiles/OpenFreeMap terms. Keep the attribution shown on the map. |
| Terrain elevation tiles | Mapterhorn (Terrarium encoding) | See https://mapterhorn.com/attribution |
| Orebit-derived PMTiles and `reference/` tables | Orebit | Derived from the sources above; they inherit those terms. The GPL does not apply to them. |

Per-sheet source, publisher and licence are listed in `reference/sources.csv` and in the app under **About & sources**.

## Not an official map

GeoAtlas output is a harmonised compilation, not an official geological map and not a Mineral Resource or Reserve statement.
