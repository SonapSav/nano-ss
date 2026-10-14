import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  RingGeometry,
  Vector3,
} from 'three/webgpu';
import type { Site } from '../world/terrain';

/**
 * Greybox spaceport on a site's pad (D-020 kit later): a 30 m pad with a
 * painted ring and edge lights, habitat modules, fuel tanks, a mast with a
 * beacon, and a floodlight. Built with +Y up; placed in the site terrain group.
 */
export function createSpaceport(site: Site) {
  const port = new Group();
  const up = site.padPoint(new Vector3()).normalize();
  const east = site.east.clone().addScaledVector(up, -site.east.dot(up)).normalize();
  const south = new Vector3().crossVectors(east, up);
  port.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(east, up, south));

  const concrete = new MeshStandardMaterial({ color: 0xb4b2ac, roughness: 0.9 });
  const paint = new MeshStandardMaterial({ color: 0xe8c040, roughness: 0.7 });
  const hull = new MeshStandardMaterial({ color: 0xd8dade, roughness: 0.5, metalness: 0.3 });
  const dark = new MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6 });

  // Set into the ground, its top 5 cm up: the landing legs stand on the terrain height.
  const pad = new Mesh(new CylinderGeometry(30, 31, 0.6, 48), concrete);
  pad.position.y = -0.25;
  const ring = new Mesh(new RingGeometry(21.4, 22.6, 64).rotateX(-Math.PI / 2), paint);
  ring.position.y = 0.07;
  port.add(pad, ring);

  const lightMaterial = new MeshBasicMaterial({ color: 0x9fe0ff });
  const edgeLights: Mesh[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const lamp = new Mesh(new SphereGeometry(0.25, 8, 4), lightMaterial);
    lamp.position.set(Math.cos(a) * 29, 0.25, Math.sin(a) * 29);
    edgeLights.push(lamp);
    port.add(lamp);
  }

  for (const [x, z] of [
    [70, 10],
    [70, -8],
    [84, 1],
  ] as const) {
    const module = new Mesh(new CylinderGeometry(3, 3, 12, 20).rotateZ(Math.PI / 2), hull);
    module.position.set(x, 3, z);
    port.add(module);
  }
  for (const z of [-40, -48]) {
    const tank = new Mesh(new CylinderGeometry(3.5, 3.5, 9, 20), hull);
    tank.position.set(-60, 4.5, z);
    port.add(tank);
  }
  const mast = new Mesh(new BoxGeometry(0.6, 30, 0.6), dark);
  mast.position.set(45, 15, 45);
  const beacon = new Mesh(
    new SphereGeometry(0.6, 10, 6),
    new MeshBasicMaterial({ color: 0xff3020 }),
  );
  beacon.position.set(45, 30.6, 45);
  port.add(mast, beacon);

  const flood = new PointLight(0xfff2dd, 400, 400, 1.6);
  flood.position.set(0, 25, 0);
  port.add(flood);

  port.traverse((o) => {
    o.castShadow = o instanceof Mesh && o.material !== lightMaterial;
    o.receiveShadow = o instanceof Mesh;
  });

  return {
    group: port,
    update(timeSeconds: number) {
      beacon.visible = timeSeconds % 2 < 0.2;
      const on = timeSeconds % 1.2 < 0.6;
      edgeLights.forEach((l, i) => (l.visible = on || i % 2 === 0));
    },
  };
}
