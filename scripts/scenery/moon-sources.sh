#!/bin/sh
# Fetches reduced copies of two NASA LRO lunar datasets from the USGS Astrogeology
# archive (D-022). The originals are 6 to 9 GB, stored one image row per block,
# so GDAL's nearest-neighbour decimation reads only the rows it needs over HTTP
# (about 0.8 GB in total). Runs in the pinned GDAL container (make scenery).
set -eu
BASE=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic
OUT=data-cache/sources
mkdir -p "$OUT"

fetch() { # name url width height
  if [ -s "$OUT/$1.tif" ]; then echo "cached $OUT/$1.tif"; return; fi
  echo "fetching $1 ($3 x $4) from $2"
  gdal_translate -q -of GTiff -r nearest -outsize "$3" "$4" "/vsicurl/$2" "$OUT/$1.tif.part"
  mv "$OUT/$1.tif.part" "$OUT/$1.tif"
}

# LROC WAC global mosaic, 100 m/pixel (NASA/GSFC/Arizona State University): surface colour.
fetch moon-wac "$BASE/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif" 8192 4096
# LOLA global elevation model, 118 m/pixel (NASA/GSFC LOLA team): relief, in 0.5 m units.
fetch moon-ldem "$BASE/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif" 4096 2048
