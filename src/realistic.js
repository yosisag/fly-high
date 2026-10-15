import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin, TilesFadePlugin, TileCompressionPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { LAT0, LON0, toLocal, toLatLon } from './geo.js';

/* ==========================================================================
 * Satellite imagery draped on the ground (Esri World Imagery tiles).
 * A coarse z15 base covers the region; sharp z18 tiles stream around the camera.
 * ======================================================================== */
const SAT_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const lon2x = (lon, n) => (lon + 180) / 360 * n;
const lat2y = (lat, n) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
const x2lon = (x, n) => x / n * 360 - 180;
const y2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

export function createSatellite(scene, renderer) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tiles = new Map();

  const makeTile = (z, x, y, yLift) => {
    const key = `${z}/${x}/${y}`;
    if (tiles.has(key)) return tiles.get(key);
    const n = 2 ** z;
    const a = toLocal(y2lat(y, n), x2lon(x, n)), b = toLocal(y2lat(y + 1, n), x2lon(x + 1, n));
    const w = b.x - a.x, d = b.z - a.z;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, color: '#ffffff', transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(a.x + w / 2, yLift, a.z + d / 2); mesh.receiveShadow = true;
    mesh.renderOrder = -2;
    const t = { key, mesh, z, used: performance.now() };
    tiles.set(key, t); group.add(mesh);
    loader.load(SAT_URL(z, x, y), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
      mat.map = tex; mat.needsUpdate = true; t.fadeIn = true;
    });
    return t;
  };

  // base layer ±7 km
  const baseZ = 15, nB = 2 ** baseZ;
  const bx0 = Math.floor(lon2x(LON0 - 0.075, nB)), bx1 = Math.floor(lon2x(LON0 + 0.075, nB));
  const by0 = Math.floor(lat2y(LAT0 + 0.063, nB)), by1 = Math.floor(lat2y(LAT0 - 0.063, nB));
  let baseBuilt = false;
  const buildBase = () => { baseBuilt = true; for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) makeTile(baseZ, x, y, 0.03).base = true; };

  let t = 0;
  const update = (dt, camPos) => {
    if (!group.visible) return;
    if (!baseBuilt) buildBase();
    for (const tile of tiles.values()) if (tile.fadeIn) { const m = tile.mesh.material; m.opacity = Math.min(1, m.opacity + dt * 2.5); if (m.opacity >= 1) { m.transparent = false; tile.fadeIn = false; m.needsUpdate = true; } }
    t -= dt; if (t > 0) return; t = 0.5;
    // detail tiles near the camera; closer = sharper
    const z = camPos.y < 120 ? 18 : 17, n = 2 ** z;
    const R = z === 18 ? 3 : 4;
    const { lat, lon } = toLatLon(camPos.x, camPos.z);
    const cx = Math.floor(lon2x(lon, n)), cy = Math.floor(lat2y(lat, n));
    const now = performance.now();
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) makeTile(z, cx + i, cy + j, z === 18 ? 0.06 : 0.045).used = now;
    // evict old detail tiles
    const detail = [...tiles.values()].filter((q) => !q.base).sort((a, b) => a.used - b.used);
    while (detail.length > 140) { const q = detail.shift(); q.mesh.material.map?.dispose(); q.mesh.material.dispose(); q.mesh.geometry.dispose(); group.remove(q.mesh); tiles.delete(q.key); }
  };
  return { group, update, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
}

/* ==========================================================================
 * Google Photorealistic 3D Tiles. Reoriented so the game origin sits at y≈0
 * and axes match the game frame (x east, z south).
 * ======================================================================== */
export function createGoogle3D(scene, camera, renderer, apiKey, { onError, errorTarget = 14, lat = LAT0, lon = LON0, height = 60, calibrateFor = Infinity, calibrateAt = null } = {}) {
  const holder = new THREE.Group(); holder.rotation.y = Math.PI; // plugin frame is X west / Z north
  scene.add(holder);
  const tiles = new TilesRenderer();
  // Google Maps keys start with "AIza"; anything else is treated as a Cesium ion token
  // (ion asset 2275207 = Google Photorealistic 3D Tiles, available on the free ion plan).
  if (apiKey.startsWith('AIza')) tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true, useRecommendedSettings: false }));
  else tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: apiKey, assetId: '2275207', autoRefreshToken: true, useRecommendedSettings: false }));
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  const reo = new ReorientationPlugin({ lat: lat * Math.PI / 180, lon: lon * Math.PI / 180, height });
  tiles.registerPlugin(reo);
  tiles.errorTarget = errorTarget;
  tiles.lruCache.maxBytesSize = 1.0 * 1024 ** 3; tiles.lruCache.minBytesSize = 0.6 * 1024 ** 3; // keep more detail resident
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  holder.add(tiles.group);

  const tint = new THREE.Color(1, 1, 1);
  tiles.addEventListener('load-model', ({ scene: s }) => {
    s.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material; m.toneMapped = false; m.fog = false; if (m.color) m.color.copy(tint);
      if (m.map) { m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); m.map.needsUpdate = true; }
    });
  });
  let failed = false;
  tiles.addEventListener('load-error', (e) => { if (!failed) { failed = true; onError?.(e); } });

  // Calibrate so the real ground at the origin is y = 0 (ellipsoid vs. sea-level differ by ~20 m in Israel).
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0);
  let calT = 0, targetY = null, calCount = 0;
  const groundAt = (x, z, from = 400) => {
    ray.set(new THREE.Vector3(x, from, z), down); ray.far = from + 600;
    const hit = ray.intersectObject(tiles.group, true)[0];
    return hit ? hit.point.y : null;
  };
  const update = (dt) => {
    if (!holder.visible) return;
    camera.updateMatrixWorld();
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.update();
    // Keep the real ground at y = 0 under the player. Only trust hits once detailed tiles are in
    // (coarse planet-scale tiles are hundreds of metres off), and use the lowest of several samples.
    calT -= dt;
    if (calT <= 0 && calCount < calibrateFor) {
      calT = 1;
      const c = calibrateAt ? { x: 0, y: 600, z: 0 } : camera.position, ys = [];
      for (const [dx, dz] of calibrateAt || [[0, 0], [35, 25], [-30, 40], [40, -35], [-45, -30], [70, 0], [0, 70], [-70, 0], [0, -70]]) {
        const y = groundAt(c.x + dx, c.z + dz, c.y + 400);
        if (y !== null) ys.push(y - holder.position.y); // local ground height
      }
      if (ys.length >= Math.min(5, (calibrateAt || [1, 1, 1, 1, 1]).length) && tiles.stats.downloading === 0 && tiles.stats.loaded > 120) {
        ys.sort((a, b) => a - b);
        const g = calibrateAt ? ys[Math.floor(ys.length / 2)] : ys[1]; // water samples: median; around camera: second lowest (robust to holes)
        targetY = -g; calCount++;
      }
    }
    if (targetY !== null) holder.position.y += (targetY - holder.position.y) * Math.min(1, dt * 2);
  };
  const setTint = (c) => { tint.copy(c); tiles.group.traverse((o) => { if (o.isMesh && o.material.color) o.material.color.copy(tint); }); };
  const attributions = () => tiles.getAttributions().filter((a) => a.type === 'string').map((a) => a.value).join(' · ');
  const dispose = () => { tiles.dispose(); scene.remove(holder); };
  const hitAlong = (from, dir, far) => { ray.set(from, dir); ray.far = far; return ray.intersectObject(tiles.group, true)[0] || null; };
  // floating origin for long flights: re-anchor the globe so the plane stays near (0,0,0)
  const setOrigin = (latDeg, lonDeg, h = 0) => { reo.lat = latDeg * Math.PI / 180; reo.lon = lonDeg * Math.PI / 180; reo.height = h; reo.transformLatLonHeightToOrigin(reo.lat, reo.lon, h); holder.updateMatrixWorld(true); };
  return { group: holder, tiles, update, groundAt, hitAlong, setTint, attributions, dispose, setOrigin, ellipsoid: tiles.ellipsoid, get calibrated() { return calCount; } };
}

/* ==========================================================================
 * Satellite atlas for building roofs: stitch z17 tiles over the city into one
 * canvas texture and expose an affine mapping local (x,z) -> uv.
 * ======================================================================== */
export async function loadRoofAtlas(bounds, onProgress, z = 16) {
  const n = 2 ** z;
  const nw = toLatLon(bounds.X0, bounds.Z0), se = toLatLon(bounds.X1, bounds.Z1);
  const tx0 = Math.floor(lon2x(nw.lon, n)), tx1 = Math.floor(lon2x(se.lon, n));
  const ty0 = Math.floor(lat2y(nw.lat, n)), ty1 = Math.floor(lat2y(se.lat, n));
  // keep within a 8192 texture: drop to z16 if the city is too wide
  let Z = z, X0 = tx0, X1 = tx1, Y0 = ty0, Y1 = ty1;
  if ((tx1 - tx0 + 1) * 256 > 8192 || (ty1 - ty0 + 1) * 256 > 8192) {
    Z = 16; const m = 2 ** Z;
    X0 = Math.floor(lon2x(nw.lon, m)); X1 = Math.floor(lon2x(se.lon, m)); Y0 = Math.floor(lat2y(nw.lat, m)); Y1 = Math.floor(lat2y(se.lat, m));
  }
  const W = (X1 - X0 + 1) * 256, H = (Y1 - Y0 + 1) * 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#8a8580'; g.fillRect(0, 0, W, H);
  const jobs = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) jobs.push([x, y]);
  let done = 0;
  const loadOne = ([x, y]) => new Promise((res) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { g.drawImage(img, (x - X0) * 256, (y - Y0) * 256); res(); };
    img.onerror = () => res();
    img.src = SAT_URL(Z, x, y);
  }).then(() => onProgress?.(++done / jobs.length));
  // 12 parallel downloads
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: 12 }, async () => { while (queue.length) await loadOne(queue.shift()); }));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
  const m = 2 ** Z;
  const a = toLocal(y2lat(Y0, m), x2lon(X0, m)), b = toLocal(y2lat(Y1 + 1, m), x2lon(X1 + 1, m));
  const map = new THREE.Vector4(1 / (b.x - a.x), -a.x / (b.x - a.x), 1 / (b.z - a.z), -a.z / (b.z - a.z));
  // canvas textures are flipped (flipY): v = 1 - v
  map.z = -map.z; map.w = 1 - map.w;
  return { tex, map, zoom: Z, tiles: jobs.length };
}
