# Third-party data and assets

Everything in this repo that comes from someone else, with its source, credit, and licence (rule from D-022). Our own work is under the project's [MIT licence](LICENSE).

| File | What | Source | Credit and licence |
|---|---|---|---|
| `public/data/moon.ephem` | Geocentric Moon positions and velocities, 2020 to 2040, every 12 h | [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) API, built by `scripts/scenery/ephemeris.ts` | NASA/JPL-Caltech Solar System Dynamics; Horizons data is freely usable, credit given here |
| `public/data/sun.ephem` | Geocentric Sun positions and velocities, 2020 to 2040, daily | as above | as above |
| `src/world/horizons.fixture.json` | Independent check points for the ephemeris tests | as above | as above |
