# Third-party data and assets

Everything in this repo that comes from someone else, with its source, credit, and licence (rule from D-022). Our own work is under the project's [MIT licence](LICENSE).

| File | What | Source | Credit and licence |
|---|---|---|---|
| `public/data/moon.ephem` | Geocentric Moon positions and velocities, 2020 to 2040, every 12 h | [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) API, built by `scripts/scenery/ephemeris.ts` | NASA/JPL-Caltech Solar System Dynamics; Horizons data is freely usable, credit given here |
| `public/data/sun.ephem` | Geocentric Sun positions and velocities, 2020 to 2040, daily | as above | as above |
| `src/world/horizons.fixture.json` | Independent check points for the ephemeris tests | as above | as above |
| `public/data/stars.bin` | 9,096 stars: positions (J2000), V magnitude, B−V colour | [Yale Bright Star Catalogue, 5th ed.](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50) (Hoffleit & Warren 1991), via CDS; built by `scripts/scenery/stars.ts` | Credit: Hoffleit & Warren / CDS Strasbourg; catalogue data freely usable with acknowledgement |
| `public/textures/earth-day.ktx2` | Earth by day, December | [NASA Visible Earth, Blue Marble Next Generation](https://visibleearth.nasa.gov/) (`world.topo.bathy.200412`) | NASA Earth Observatory (Reto Stöckli); public domain |
| `public/textures/earth-night.ktx2` | City lights | [NASA Black Marble 2016](https://earthobservatory.nasa.gov/features/NightLights) | NASA Earth Observatory / Suomi NPP VIIRS; public domain |
| `public/textures/earth-clouds.ktx2` | Cloud cover | NASA Visible Earth, Blue Marble clouds (`cloud_combined_2048`) | NASA Earth Observatory; public domain |
| `public/textures/moon-color.ktx2` | Lunar surface | LROC WAC Global Morphologic Mosaic 100 m (June 2013), USGS Astrogeology archive, reduced by `scripts/scenery/moon-sources.sh` | NASA/GSFC/Arizona State University; NASA data, free to use with credit |
| `public/textures/moon-normal.ktx2` | Lunar relief (normal map, 2× height exaggeration) | LOLA Global LDEM 118 m (March 2014), USGS Astrogeology archive, as above | NASA/GSFC LOLA team; NASA data, free to use with credit |

Textures are resized and encoded as GPU-compressed KTX2 (Basis Universal) by `scripts/scenery/textures.ts`; the downloads stay in `data-cache/` (git-ignored). Rebuild everything with `make scenery`.
