#!/bin/sh
# Local terrain for the Moon spaceports (Stage 5, D-022): a 40 x 40 km window
# around each site in a gnomonic projection centred on it (straight lines on
# the tangent plane = great circles; x, y in metres map exactly to directions),
# from the LOLA 118 m elevation model and the LROC WAC 100 m mosaic. GDAL reads
# only the needed rows over HTTP. Runs in the pinned GDAL container (make scenery).
set -eu
BASE=https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic
LDEM="$BASE/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif"
WAC="$BASE/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif"
OUT=data-cache/sources/sites
mkdir -p "$OUT"
# Fetch big contiguous chunks instead of one request per image row.
export CPL_VSIL_CURL_CHUNK_SIZE=8388608 GDAL_HTTP_MERGE_CONSECUTIVE_RANGES=YES GDAL_HTTP_MAX_RETRY=4

site() { # name lat lon
  srs="+proj=gnom +lat_0=$2 +lon_0=$3 +R=1737400 +units=m +no_defs"
  for layer in ldem wac; do
    file="$OUT/$1-$layer.tif"
    if [ -s "$file" ]; then echo "cached $file"; continue; fi
    if [ "$layer" = ldem ]; then src="$LDEM"; type=Int16; else src="$WAC"; type=Byte; fi
    echo "warping $1 $layer"
    gdalwarp -q -overwrite -t_srs "$srs" -te -20000 -20000 20000 20000 -tr 40 40 \
      -r bilinear -ot "$type" "/vsicurl/$src" "$file.part.tif"
    mv "$file.part.tif" "$file"
  done
  # Wide ring: 400 x 400 km at 2 km from the reduced global elevation model
  # (moon-sources.sh), so real terrain reaches past the horizon around each site.
  if [ ! -s "$OUT/$1-ring.tif" ]; then
    gdalwarp -q -overwrite -t_srs "$srs" -te -200000 -200000 200000 200000 -tr 2000 2000 \
      -r bilinear -ot Int16 data-cache/sources/moon-ldem.tif "$OUT/$1-ring.tif"
  fi
  # Heights are signed 16-bit: also write them raw (ENVI, little-endian), since
  # image libraries read signed TIFFs as unsigned.
  for layer in ldem ring; do
    if [ ! -s "$OUT/$1-$layer.raw" ]; then
      gdal_translate -q -of ENVI "$OUT/$1-$layer.tif" "$OUT/$1-$layer.raw"
    fi
  done
}

# Apollo 11, Tranquility Base (NASA landing coordinates).
site tranquility 0.67416 23.47314
# Shackleton crater, centred on the crater (IAU gazetteer 89.67 S, 129.78 E); the pad goes on its rim.
site shackleton -89.67 129.78
