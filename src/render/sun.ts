import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three/webgpu';

/** Distance at which the Sun is drawn (m): far beyond the Moon, well inside the far plane. */
const SUN_DRAW_DISTANCE = 1e10;
/** The Sun's real angular diameter, 0.53°. */
const SUN_ANGULAR_DIAMETER = (0.53 * Math.PI) / 180;

function radialTexture(stops: [number, string][]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new CanvasTexture(canvas);
}

/** Visible Sun: a disc at its real angular size plus a glare halo. Earth hides it in eclipse. */
export function createSun() {
  const group = new Group();
  const discSize = 2 * Math.tan(SUN_ANGULAR_DIAMETER / 2) * SUN_DRAW_DISTANCE;
  const disc = new Sprite(
    new SpriteMaterial({
      map: radialTexture([
        [0, '#ffffff'],
        [0.45, '#fffbea'],
        [0.5, 'rgba(255,240,200,0)'],
      ]),
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  disc.scale.setScalar(discSize * 2);
  const glare = new Sprite(
    new SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,245,220,0.55)'],
        [0.15, 'rgba(255,230,180,0.18)'],
        [1, 'rgba(255,220,160,0)'],
      ]),
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  glare.scale.setScalar(discSize * 18);
  group.add(glare, disc);
  return {
    group,
    /** Places the Sun along `direction` from the camera's neighbourhood (render space). */
    update(direction: Vector3) {
      group.position.copy(direction).normalize().multiplyScalar(SUN_DRAW_DISTANCE);
    },
  };
}
