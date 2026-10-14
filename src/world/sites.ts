import { Site, type SiteData } from './terrain';

interface SiteMeta extends Omit<SiteData, 'heights' | 'ringHeights'> {
  title: string;
}

/** A spaceport: its terrain plus a display name (Stage 5). */
export interface Spaceport {
  name: string;
  title: string;
  site: Site;
}

/** Loads public/data/sites.json and each site's window and ring heights. */
export async function loadSpaceports(base = 'data'): Promise<Spaceport[]> {
  const response = await fetch(`${base}/sites.json`);
  if (!response.ok)
    throw new Error(`Could not load ${base}/sites.json: HTTP ${String(response.status)}`);
  const metas = (await response.json()) as SiteMeta[];
  return Promise.all(
    metas.map(async (meta) => {
      const bin = await fetch(`${base}/sites/${meta.name}.bin`);
      if (!bin.ok) throw new Error(`Could not load site ${meta.name}: HTTP ${String(bin.status)}`);
      // Window heights, then ring heights (Int16, 0.5 m units).
      const raw = new Int16Array(await bin.arrayBuffer());
      const all = Float32Array.from(raw, (v) => v * 0.5);
      const heights = all.subarray(0, meta.size * meta.size);
      const ringHeights = all.subarray(meta.size * meta.size);
      if (ringHeights.length !== meta.ringSize * meta.ringSize) {
        throw new Error(
          `Site ${meta.name}: expected ${String(meta.ringSize ** 2)} ring heights, got ${String(ringHeights.length)}`,
        );
      }
      return {
        name: meta.name,
        title: meta.title,
        site: new Site({ ...meta, heights, ringHeights }),
      };
    }),
  );
}
