import * as THREE from '../vendor/three.module.js';
import { LANES, smooth, clamp, DROP_DURATION } from './engine.js';
const USB_Z = 4.5;

const C = { sage: '#dce8df', cream: '#eeeddb', silver: '#929f9b', edge: '#b7c0b8', dark: '#253c34', green: '#789782', white: '#faf8ec', orange: '#dc825e', gold: '#d7bc7e' };
const materials = new Map(), geometries = new Map();
function mat(color, metalness = 0, roughness = 0.65) {
  const key = [color, metalness, roughness].join();
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  return materials.get(key);
}
function roundedGeometry(w, h, d, r = 0.08) {
  const key = [w, h, d, r].join();
  if (geometries.has(key)) return geometries.get(key);
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const x = -w / 2 + r, y = -h / 2 + r, s = new THREE.Shape();
  s.moveTo(x, y - r); s.lineTo(x + w - 2 * r, y - r);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, y);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, x, y - r);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: 0.005, bevelSegments: 2, steps: 1, curveSegments: 5 });
  g.translate(0, 0, -d / 2 + r); geometries.set(key, g); return g;
}
function box(parent, w, h, d, x, y, z, color, radius = 0, metalness = 0) {
  const geom = radius ? roundedGeometry(w, h, d, radius) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geom, mat(color, metalness));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, r1, r2, h, x, y, z, color, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segments), mat(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function planeText(text, width, height, options = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * height / width);
  const ctx = canvas.getContext('2d');
  if (options.bg) { ctx.fillStyle = options.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = options.color || '#5f7062'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${options.weight || 500} ${options.size || 85}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  const lines = text.split('\n'); lines.forEach((l, i) => ctx.fillText(l, 256, canvas.height / 2 + (i - (lines.length - 1) / 2) * (options.lineHeight || 100)));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: !options.bg, depthWrite: false, side: THREE.DoubleSide }));
  return mesh;
}
function rectPath(x, y, w, h) { const p = new THREE.Path(); p.moveTo(x, y); p.lineTo(x, y + h); p.lineTo(x + w, y + h); p.lineTo(x + w, y); p.closePath(); return p; }

export class DeskScene {
  constructor(container) {
    this.container = container; this.mobile = innerWidth <= 760;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.65 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.16;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(C.sage);
    this.scene.fog = new THREE.Fog(C.sage, 33, 76);
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 120);
    this.scene.add(new THREE.HemisphereLight('#f7fff0', '#899a87', 2.35));
    const sun = new THREE.DirectionalLight('#fff3d9', 3.0); sun.position.set(-9, 17, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 14, bottom: -13, near: 1, far: 45 });
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00035; sun.shadow.radius = 4; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#d5ede2', 0.65); fill.position.set(9, 9, -8); this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#cbded0')); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.7; floor.receiveShadow = true; this.scene.add(floor);
    this.tableTiles = [];
    for (let i = 0; i < 4; i++) {
      const tile = new THREE.Group(); this.scene.add(tile); this.tableTiles.push(tile);
      box(tile, 14, .48, 24, 0, -.15, 0, C.cream, .06);
      for (let j = 0; j < 8; j++) box(tile, 12.8, .001, .012, 0, .091, -10.5 + j * 3, '#e3e4d2');
    }
    this.desk = new THREE.Group(); this.scene.add(this.desk);
    this.laptop = new THREE.Group(); this.scene.add(this.laptop);
    this.explodable = []; this.targetLane = -1; this.lastScreenKey = '';
    this.buildLaptop(); this.buildUSB(); this.buildProps(); this.buildParticles(); this.prepareExplosion(); this.buildPool();
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); document.dispatchEvent(new CustomEvent('usb-context-lost')); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => document.dispatchEvent(new CustomEvent('usb-context-restored')));
  }
  buildLaptop() {
    const p = this.laptop;
    box(p, 7.0, .16, 4.25, 0, .22, -3.35, '#798b83', .055, .45);
    box(p, 7.0, .13, 4.25, 0, .72, -3.35, '#a4b0aa', .05, .5);
    box(p, .12, .37, 4.13, -3.44, .47, -3.35, C.silver, .025, .55);
    box(p, .12, .37, 4.13, 3.44, .47, -3.35, C.silver, .025, .55);
    box(p, 6.9, .38, .13, 0, .47, -5.43, C.silver, .025, .45);
    // Interior is behind the front plate, leaving a real recess at the port.
    box(p, 6.76, .3, .12, 0, .45, -1.57, '#344b40', .02);
    this.frontPlate = null;
    this.port = new THREE.Group(); p.add(this.port);
    this.portBack = box(this.port, 1.0, .285, .05, 0, .47, -1.55, '#142f28', .012);
    box(this.port, 1.04, .035, .28, 0, .625, -1.4, '#d0d4c3', .006, .6);
    box(this.port, 1.04, .035, .28, 0, .315, -1.4, '#b4bfb0', .006, .5);
    box(this.port, .035, .3, .28, -.515, .47, -1.4, '#c0c8b9', .006, .6);
    box(this.port, .035, .3, .28, .515, .47, -1.4, '#c0c8b9', .006, .6);
    this.tongue = new THREE.Group(); this.tongue.position.set(0, .47, 0); this.port.add(this.tongue);
    box(this.tongue, .86, .065, .23, 0, -.085, -1.38, '#bac3b1', .012);
    for (let i = 0; i < 4; i++) box(this.tongue, .11, .008, .16, -.27 + i * .18, -.048, -1.365, C.gold);
    // Front panel detail: tiny status LEDs and a jack.
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(.021, 8, 6), new THREE.MeshBasicMaterial({ color: i ? '#c7d0ba' : '#bcdb9c' }));
      led.position.set(-3.02 + i * .1, .46, -1.204); p.add(led);
    }
    for (let i = 0; i < 7; i++) box(p, .025, .17, .012, 2.7 + i * .07, .45, -1.202, '#526a5b');
    this.keyboard = new THREE.Group(); p.add(this.keyboard);
    this.keyboardKeys = [];
    box(this.keyboard, 6.35, .018, 2.25, 0, .793, -3.88, '#72867b', .005);
    const keyGeom = roundedGeometry(.385, .055, .275, .017);
    const keyMat = mat('#455c51', .25, .57);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 14; col++) {
      if (row === 5 && col > 3 && col < 10) continue;
      const key = new THREE.Mesh(keyGeom, keyMat); key.position.set(-2.83 + col * .435, .835, -4.79 + row * .36);
      key.castShadow = true; key.receiveShadow = true; this.keyboard.add(key);
      this.keyboardKeys.push(key);
    }
    this.spaceKey = box(this.keyboard, 2.6, .055, .275, .01, .835, -2.99, '#455c51', .017, .25);
    this.keyInstances = new THREE.InstancedMesh(keyGeom, keyMat, this.keyboardKeys.length);
    this.keyInstances.castShadow = true; this.keyInstances.receiveShadow = true;
    this.keyboardKeys.forEach((key, i) => { key.updateMatrix(); this.keyInstances.setMatrixAt(i, key.matrix); key.visible = false; });
    this.keyboard.add(this.keyInstances);
    box(p, 2.4, .014, .94, 0, .802, -1.99, '#b7c1b7', .006, .45);
    box(p, 2.25, .015, .82, 0, .812, -1.99, '#a9b7ab', .006, .35);
    const hinge = cylinder(p, .11, .11, 6.3, 0, .85, -5.24, '#647c6e'); hinge.rotation.z = Math.PI / 2;
    this.screen = new THREE.Group(); this.screen.position.set(0, .85, -5.24); this.screen.rotation.x = -.14; p.add(this.screen);
    box(this.screen, 7.0, 4.25, .19, 0, 2.1, -.02, '#4b6356', .075, .4);
    box(this.screen, 6.7, 3.97, .025, 0, 2.12, .087, '#1d342b', .01);
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = 768; this.screenCanvas.height = 430;
    this.screenCtx = this.screenCanvas.getContext('2d'); this.screenTexture = new THREE.CanvasTexture(this.screenCanvas); this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.32, 3.54), new THREE.MeshBasicMaterial({ map: this.screenTexture })); screenMesh.position.set(0, 2.13, .108); this.screen.add(screenMesh);
    const cameraDot = new THREE.Mesh(new THREE.CircleGeometry(.025, 10), mat('#8a9c89')); cameraDot.position.set(0, 4.075, .113); this.screen.add(cameraDot);
    this.screenLight = new THREE.PointLight('#bdd6a4', .5, 7); this.screenLight.position.set(0, 2.4, -4.5); this.scene.add(this.screenLight);
    this.buildFront(1, 0);
  }
  frontGeometry(lane) {
    this.frontGeometries ??= [];
    if (!this.frontGeometries[lane]) {
      const shape = new THREE.Shape(); shape.moveTo(-3.5, .28); shape.lineTo(3.5, .28); shape.lineTo(3.5, .66); shape.lineTo(-3.5, .66); shape.closePath();
      shape.holes.push(rectPath(LANES[lane] - .53, .305, 1.06, .33));
      this.frontGeometries[lane] = new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: false });
    }
    return this.frontGeometries[lane];
  }
  buildFront(lane, side) {
    if (!this.frontPlate) {
      this.frontPlate = new THREE.Mesh(this.frontGeometry(lane), mat(C.silver, .5));
      this.frontPlate.position.z = -1.27; this.frontPlate.castShadow = true; this.frontPlate.receiveShadow = true; this.laptop.add(this.frontPlate);
    }
    this.frontPlate.geometry = this.frontGeometry(lane); this.port.position.x = LANES[lane]; this.targetLane = lane;
    this.tongue.rotation.z = side * Math.PI;
  }
  buildUSB() {
    this.usb = new THREE.Group(); this.scene.add(this.usb);
    this.usb.position.set(0, .47, 5.1);
    const p = this.usb;
    box(p, .91, .37, 1.95, 0, 0, .655, C.white, .13);
    box(p, .89, .012, 1.76, 0, -.185, .65, '#e9e6d7', .004);
    box(p, .8, .015, .045, 0, .187, 1.29, '#e2e5d4', .004);
    // Open metal shell: separate top, bottom and walls, not a solid cuboid.
    const topShape = new THREE.Shape(); topShape.moveTo(-.41, -1.13); topShape.lineTo(.41, -1.13); topShape.lineTo(.41, -.26); topShape.lineTo(-.41, -.26); topShape.closePath();
    topShape.holes.push(rectPath(-.265, -.88, .145, .19), rectPath(.12, -.88, .145, .19));
    const top = new THREE.Mesh(new THREE.ShapeGeometry(topShape), new THREE.MeshStandardMaterial({ color: '#b5bfb3', metalness: .72, roughness: .35, side: THREE.DoubleSide }));
    top.rotation.x = Math.PI / 2; top.position.y = .126; top.castShadow = true; p.add(top);
    box(p, .82, .026, .87, 0, -.126, -.695, '#acb8a9', .005, .7);
    box(p, .025, .25, .87, -.4, 0, -.695, '#9cab9d', .005, .7);
    box(p, .025, .25, .87, .4, 0, -.695, '#9cab9d', .005, .7);
    box(p, .735, .07, .66, 0, .062, -.69, '#334d3f', .012);
    for (let i = 0; i < 4; i++) box(p, .115, .01, .47, -.27 + i * .18, .023, -.79, C.gold, 0, .5);
    const label = planeText('16GB', .65, .28, { size: 100, color: '#71816c' }); label.rotation.x = -Math.PI / 2; label.position.set(0, .193, .43); p.add(label);
    const led = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), new THREE.MeshBasicMaterial({ color: '#8bae7b' })); led.position.set(0, .19, 1.25); p.add(led); this.usbLED = led;
    this.usbShadow = this.contactShadow(1.65, 3.3, .19); this.usbShadow.position.set(0, .101, 5.4); this.scene.add(this.usbShadow);
  }
  contactShadow(w, h, opacity) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
    grad.addColorStop(0, 'rgba(49,71,43,.8)'); grad.addColorStop(.4, 'rgba(49,71,43,.35)'); grad.addColorStop(1, 'rgba(49,71,43,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m;
  }
  buildProps() {
    const p = this.desk;
    const notebook = new THREE.Group(); notebook.position.set(5.0, .15, 2.6); notebook.rotation.y = -.15; p.add(notebook);
    box(notebook, 1.5, .07, 2.1, 0, 0, 0, '#718d7b', .025);
    box(notebook, 1.4, .055, 2.0, -.02, .055, -.01, '#fff8df', .018);
    for (let i = 0; i < 5; i++) box(notebook, .9, .001, .009, -.05, .086, -.6 + i * .19, '#d5d8bd');
    const pen = cylinder(p, .035, .035, 2.0, 6.0, .15, 2.6, '#c7805b', 12); pen.rotation.x = Math.PI / 2; pen.rotation.y = -.15;
    const mug = new THREE.Group(); mug.position.set(-5.3, .11, -7); p.add(mug);
    cylinder(mug, .55, .47, .82, 0, .42, 0, '#eee5cd'); cylinder(mug, .48, .48, .015, 0, .838, 0, '#b9ad89'); cylinder(mug, .44, .44, .015, 0, .849, 0, '#6b6950');
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.29, .085, 10, 24), mat('#e9dec4')); handle.position.set(-.58, .46, 0); mug.add(handle); handle.castShadow = true;
    cylinder(p, .75, .75, .04, -5.3, .12, -7, '#a5b89b');
    const plant = new THREE.Group(); plant.position.set(5.1, .11, -14); p.add(plant);
    cylinder(plant, .56, .43, .7, 0, .36, 0, '#bd8c6b'); cylinder(plant, .49, .49, .035, 0, .72, 0, '#687458');
    for (let i = 0; i < 14; i++) { const a = i * 2.4, leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat(i % 3 ? '#7b9b73' : '#9eb18b')); leaf.scale.set(.14, .37, .14); leaf.position.set(Math.cos(a) * .24, .94, Math.sin(a) * .24); leaf.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6); plant.add(leaf); leaf.castShadow = true; }
    this.propTiles = [p, p.clone(true)]; this.scene.add(this.propTiles[1]);
  }

  prepareExplosion() {
    const parts = [...this.laptop.children.filter(c => c !== this.port && c !== this.frontPlate && c !== this.keyboard), ...this.keyboard.children.filter(c => !c.isInstancedMesh)];
    this.explodable = parts.map((object, i) => {
      const a = i * 2.399963, amp = .45 + (i % 9) * .15;
      const size = new THREE.Vector3();
      if (object.geometry) { object.geometry.computeBoundingBox(); object.geometry.boundingBox.getSize(size); }
      const large = object === this.screen || Math.max(size.x, size.y, size.z) > 2.5;
      return { object, large, base: object.position.clone(), rotation: object.rotation.clone(), dir: new THREE.Vector3(Math.cos(a) * amp, .5 + (i % 6) * .15, Math.sin(a) * amp), spin: new THREE.Vector3(Math.sin(a) * 1.6, Math.cos(a * 2) * 1.5, Math.cos(a) * 1.5) };
    });
    this.debris = new THREE.Group(); this.scene.add(this.debris);
    this.debrisParts = [];
    for (let i = 0; i < 20; i++) {
      const board = new THREE.Group(), a = i * 2.4;
      box(board, .25 + i % 4 * .13, .04, .35 + i % 3 * .14, 0, 0, 0, i % 2 ? '#3a8b61' : '#4c6656', .008);
      box(board, .16, .08, .15, .02, .05, 0, '#243b2d', .008);
      for (let k = 0; k < 3; k++) box(board, .025, .01, .1, -.13 + k * .08, .027, .17, C.gold);
      this.debris.add(board); this.debrisParts.push({ object: board, dir: new THREE.Vector3(Math.cos(a) * (2 + i % 3), 1.0 + i % 5 * .35, Math.sin(a) * 2.6) });
    }
    this.debris.visible = false;
  }
  buildParticles() {
    this.puffs = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.24, 1), new THREE.MeshStandardMaterial({ color: '#e5e9d5', transparent: true, opacity: .8, roughness: 1, depthWrite: false }));
      m.visible = false; this.scene.add(m); this.puffs.push(m);
    }
  }
  buildPool() {
    this.scene.remove(this.screenLight);
    const prototype = new THREE.Group(); this.scene.add(prototype);
    prototype.add(this.laptop, this.debris, ...this.puffs);
    const shadow = this.contactShadow(8, 5.6, .2); shadow.position.set(0, .104, -3.2); prototype.add(shadow);
    const sourceNodes = []; prototype.traverse(o => sourceNodes.push(o));
    this.models = [];
    for (let i = 0; i < 4; i++) {
      const root = i === 0 ? prototype : prototype.clone(true), nodes = []; root.traverse(o => nodes.push(o));
      if (i) this.scene.add(root);
      const mapping = new Map(sourceNodes.map((o, n) => [o, nodes[n]]));
      const model = { root, id: null, laptop: mapping.get(this.laptop), front: mapping.get(this.frontPlate), port: mapping.get(this.port), tongue: mapping.get(this.tongue), keyboard: mapping.get(this.keyboard), instances: mapping.get(this.keyInstances), keys: this.keyboardKeys.map(o => mapping.get(o)),
        parts: this.explodable.map(part => ({ ...part, object: mapping.get(part.object) })),
        debris: mapping.get(this.debris), debrisParts: this.debrisParts.map(part => ({ ...part, object: mapping.get(part.object) })), puffs: this.puffs.map(o => mapping.get(o)), shadow: mapping.get(shadow) };
      model.puffs.forEach(o => { o.material = o.material.clone(); }); model.shadow.material = model.shadow.material.clone();
      root.visible = false; this.models.push(model);
    }
    this.viewState = [];
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.mobile = w <= 760; this.renderer.setSize(w, h, false); this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 1.75));
    this.camera.aspect = w / h; this.camera.clearViewOffset();
    if (this.mobile) {
      this.camera.fov = 45;
      const factor = w / h < .51 ? 1.06 : 1;
      this.baseCamera = new THREE.Vector3(5.2 * factor, 17.2 * factor, 22.8 * factor); this.lookAt = new THREE.Vector3(0, .65, -1);
      this.camera.setViewOffset(w, h, 0, -h * .015, w, h);
    } else {
      this.camera.fov = w / h > 2 ? 38 : 40;
      this.baseCamera = new THREE.Vector3(9, 13.5, 19.5); this.lookAt = new THREE.Vector3(0, .5, -1.5);
    }
    this.camera.position.copy(this.baseCamera); this.camera.lookAt(this.lookAt); this.camera.updateProjectionMatrix();
  }

  update(game) {
    const ids = new Set(game.obstacles.map(o => o.id)); this.viewState = [];
    for (const m of this.models) if (!ids.has(m.id)) { m.id = null; m.root.visible = false; }
    for (const o of game.obstacles) {
      let model = this.models.find(m => m.id === o.id);
      if (!model) { model = this.models.find(m => m.id === null); if (!model) continue; model.id = o.id; }
      const remaining = o.contactDistance - game.distance;
      const age = o.resolvedAt === null ? 0 : game.totalTime - o.resolvedAt;
      model.root.visible = o.state !== 'waiting' && !(o.state === 'breaking' && age > 1.65);
      if (!model.root.visible) continue;
      model.root.position.set(0, 0, USB_Z + .14 - remaining);
      model.front.geometry = this.frontGeometry(o.lane); model.port.position.x = LANES[o.lane]; model.tongue.rotation.z = o.side * Math.PI;
      let dropY = o.state === 'falling' ? 8.5 * (1 - (o.dropAge / o.dropDuration) ** 2) : 0;
      if (o.state === 'landed' && o.landedAt !== null) { const t = game.totalTime - o.landedAt; dropY = .11 * Math.sin(t * 19) * Math.exp(-t * 7); }
      const crash = o.state === 'crashed', shake = crash ? Math.sin(age * 59) * Math.exp(-age * 7) * .13 : 0;
      model.laptop.position.set(shake * .4, dropY, 0); model.laptop.rotation.set(0, 0, shake * .25);
      const breaking = o.state === 'breaking', t = breaking ? Math.max(0, age - .12) : 0, e = smooth(t / .25), fade = breaking ? 1 - smooth((age - 1.08) / .57) : 1;
      for (const part of model.parts) {
        part.object.position.copy(part.base);
        if (breaking) { part.object.position.x += part.dir.x * t * 2.6; part.object.position.z += part.dir.z * t * 2.6; part.object.position.y = Math.max(.14, part.base.y + part.dir.y * t * 3.2 - t * t * 3.0); }
        part.object.rotation.set(part.rotation.x + part.spin.x * e * 1.4, part.rotation.y + part.spin.y * e, part.rotation.z + part.spin.z * e);
        part.object.scale.setScalar((part.large ? 1 - .83 * e : 1) * fade);
      }
      model.keys.forEach(key => { key.visible = breaking && e > .015; }); model.instances.visible = !breaking || e < .015;
      model.front.scale.setScalar((1 - .9 * e) * fade); model.port.scale.setScalar((1 - .75 * e) * fade);
      model.shadow.material.opacity = Math.max(.04, .2 - dropY * .018) * (breaking ? fade * .6 : 1);
      model.debris.visible = breaking && t > 0 && fade > 0;
      for (let i = 0; i < model.debrisParts.length; i++) { const p = model.debrisParts[i]; p.object.position.set(p.dir.x * t * 2, Math.max(.15, .5 + p.dir.y * t * 2.8 - t * t * 3), -3.1 + p.dir.z * t * 2); p.object.rotation.set(t * i, t * i * .6, t * i * .3); p.object.scale.setScalar(Math.min(1, e * 3) * fade); }
      for (let i = 0; i < model.puffs.length; i++) { const p = model.puffs[i]; p.visible = breaking && t > 0 && t < 1.05; if (p.visible) { const a = i * 2.4; p.position.set(Math.cos(a) * t * 3, .3, -2 + Math.sin(a) * t * 2); p.scale.setScalar(.2 + Math.min(t * 3, 1) * (1 + i % 3 * .3)); p.material.opacity = .7 * (1 - smooth(t / 1.05)); } }
      this.viewState.push({ id: o.id, state: o.state, remaining, dropY, exploded: breaking && e > 0, intact: !breaking, visible: model.root.visible });
    }
    let y = .47, roll = game.angle, recoil = 0, shake = 0;
    if (game.flip) y += Math.sin(Math.PI * clamp(game.flip.t / .34, 0, 1)) * .44;
    if (['crash', 'over'].includes(game.status)) { const t = game.phaseTime; shake = Math.sin(t * 59) * Math.exp(-t * 7) * .13; recoil = smooth(t / .2) * .18; roll += shake; }
    this.usb.position.set(game.x + shake * .4, y, USB_Z + recoil); this.usb.rotation.z = roll;
    this.usbShadow.position.set(game.x + .08, .105, USB_Z + .48 + recoil); this.usbShadow.material.opacity = .18 - Math.max(0, y - .47) * .2;
    this.usbLED.material.color.set(game.totalTime < game.dockingUntil + .25 ? '#bedf96' : '#8bae7b');
    this.tableTiles.forEach((tile, i) => { tile.position.z = 12 - i * 24 + game.distance % 24; });
    this.propTiles.forEach((tile, i) => { tile.position.z = ((game.distance + i * 24 + 12) % 48) - 24; });
    this.camera.position.copy(this.baseCamera).add(new THREE.Vector3(shake * .45, shake * .22, 0)); this.camera.lookAt(this.lookAt);
    const screenKey = `${game.cleared}-${Math.floor((game.target?.contactDistance - game.distance || 0) * 2)}`;
    if (screenKey !== this.lastScreenKey) { this.drawScreen(game); this.lastScreenKey = screenKey; }
    this.lastDistance = game.distance; this.renderer.render(this.scene, this.camera);
  }

  drawScreen(game) {
    const c = this.screenCtx; c.fillStyle = '#1b3029'; c.fillRect(0, 0, 768, 430);
    c.textAlign = 'center'; c.fillStyle = '#c6dfaf'; c.font = '160px "Consolas", monospace'; c.fillText(String(game.cleared).padStart(2, '0'), 384, 250);
    const progress = game.target ? 1 - Math.min(1, (game.target.contactDistance - game.distance) / 14.4) : 1;
    for (let i = 0; i < 10; i++) { c.fillStyle = progress * 10 > i ? '#a5c394' : '#3b5645'; c.fillRect(205 + i * 36, 325, 23, 7); }
    this.screenTexture.needsUpdate = true;
  }
  metrics() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio(), threeRevision: THREE.REVISION, modelPoolSize: this.models.length, computers: this.viewState, worldUSBz: -this.lastDistance, worldCameraZ: this.baseCamera.z - this.lastDistance }; }
}
