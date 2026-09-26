#!/usr/bin/env bash
# Bangun PMTiles dari GeoJSONSeq. Butuh tippecanoe ≥ 2.17 (https://github.com/felt/tippecanoe).
set -euo pipefail
REGION="${1:?Pemakaian: 06_tile.sh <wilayah>}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/data/out/$REGION"

LAYERS=(-L "units:$DIR/units.geojsonl")
[[ -f "$DIR/lines.geojsonl" ]] && LAYERS+=(-L "lines:$DIR/lines.geojsonl")

tippecanoe -q -o "$DIR/$REGION.pmtiles" --force \
  -Z6 -z14 \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --simplification=4 \
  --maximum-tile-bytes=500000 \
  --attribution='Pusat Survei Geologi, Badan Geologi; diolah Orebit' \
  "${LAYERS[@]}"

echo "Selesai: $DIR/$REGION.pmtiles ($(du -h "$DIR/$REGION.pmtiles" | cut -f1))"
