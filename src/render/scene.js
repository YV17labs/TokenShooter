/* ═══════════════════════════ 3D rendering (three.js) ═══════════════════════════
   First-person view of the grid world. The camera's horizontal field of view is exactly the
   90° used by the perception: what the viewer sees is what the model is told about.
   The game gives positions in cells, centred on whole numbers; the scene puts cell (x, y) on the
   floor square from (x, y) to (x + 1, y + 1), hence the + 0.5 wherever a game position comes in. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SIZE, DIRS, wallAt, relative, ACTION_TIME } from "../game/index.js";
import { RED, GOLD, MINT, BEAM, FIRE, ease, hdr, wrap, approach, additive, dispose, random } from "./common.js";
import { glowTexture, wallTexture, floorTexture, skinTexture, veinTexture, scorchTexture } from "./textures.js";
import { Particles } from "./particles.js";
import { SPECIES } from "./monsters.js";

const MOVE_TIME = ACTION_TIME["Move forward"], TURN_TIME = ACTION_TIME["Turn left"];
const WALL_HEIGHT = 1.15, EYE = 0.52, FOV_H = 90, FIREBALL_Y = 0.47;
const TRIM = { "1": 0x6b8fd6, "2": 0xe8805f, "3": 0x3fd0bb, "4": 0xa283ff };
const HORIZON = 0x0d1428, ZENITH = 0x020308;

export class World3D {
  constructor(container) {
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.prepend(renderer.domElement);   // under the HUD layers

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(HORIZON, 0.085);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.12;

    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.02, 60);
    scene.add(this.camera);
    this.glow = glowTexture();
    this.tex = { skin: skinTexture(), veins: veinTexture(), scorch: scorchTexture() };

    this.buildSky();
    this.buildLevel();
    this.buildLights();
    this.buildWeapon();
    this.buildFireballs();
    this.particles = new Particles(scene);
    this.beams = [];
    this.enemies = new Map();
    this.items = new Map();
    this.decals = [];
    this.shake = 0;
    this.time = 0;

    this.composer = new EffectComposer(renderer);
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(scene, this.camera));
    const weaponPass = new RenderPass(this.weaponScene, this.weaponCamera);
    weaponPass.clear = false;
    weaponPass.clearDepth = true;                 // the weapon never sinks into a wall
    this.composer.addPass(weaponPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    for (const cam of [this.camera, this.weaponCamera]) {
      cam.aspect = w / h;
      // Keep the horizontal field at 90° whatever the shape of the view.
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV_H / 2)) / cam.aspect));
      cam.updateProjectionMatrix();
    }
    this.particles.material.uniforms.scale.value = h * this.renderer.getPixelRatio() * 0.9;
    this.width = w; this.height = h;
  }

  /* ─────────────── Static level ─────────────── */

  buildSky() {
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(ZENITH) }, horizon: { value: new THREE.Color(HORIZON) } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.35)), 1.0); }`,
    }));
    this.scene.add(sky);

    const rnd = random(5), stars = [];
    for (let i = 0; i < 700; i++) {
      const u = 0.12 + rnd() * 0.88, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      stars.push(r * Math.cos(th) * 45, u * 45, r * Math.sin(th) * 45);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, color: hdr(0xb9c8ff, 1.4), map: this.glow, transparent: true, opacity: 0.8,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.stars);
  }

  buildLevel() {
    const scene = this.scene, m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const walls = [], trims = [], slits = [];
    const rnd = random(99);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const type = wallAt(x, y);
      if (!type) continue;
      const open = DIRS.filter(([dx, dy]) => !wallAt(x + dx, y + dy));
      if (!open.length) continue;                              // buried: never visible
      walls.push([x, y]);
      for (const [dx, dy] of open) {
        const fx = x + 0.5 + dx * 0.506, fz = y + 0.5 + dy * 0.506;
        const along = dx !== 0 ? [0.012, 1, 1] : [1, 1, 0.012];
        trims.push({ pos: [fx, 0.03, fz], scale: [along[0], 0.022, along[2]], color: hdr(TRIM[type], 1.7) });
        trims.push({ pos: [fx, WALL_HEIGHT - 0.012, fz], scale: [along[0], 0.014, along[2]], color: hdr(TRIM[type], 1.1) });
        if (rnd() < 0.2) slits.push({ pos: [fx, 0.58, fz], scale: [dx !== 0 ? 0.012 : 0.028, 0.5, dx !== 0 ? 0.028 : 0.012], color: hdr(TRIM[type], 2.2) });
      }
    }

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.78, metalness: 0.2 });
    wallMat.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_HEIGHT, 1), wallMat, walls.length);
    walls.forEach(([x, y], i) => wallMesh.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.5, WALL_HEIGHT / 2, y + 0.5), q, one)));
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    scene.add(wallMesh);

    const strips = [...trims, ...slits];
    const stripMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), strips.length);
    strips.forEach((s, i) => {
      stripMesh.setMatrixAt(i, m.compose(new THREE.Vector3(...s.pos), q, new THREE.Vector3(...s.scale)));
      stripMesh.setColorAt(i, s.color);
    });
    scene.add(stripMesh);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.3 });
    floorMat.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), floorMat);
    floor.position.set(SIZE / 2, 0, SIZE / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // Perception overlay: floor cells light up to show what the sensors report.
    this.cellIndex = new Map();
    const free = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!wallAt(x, y)) { this.cellIndex.set(y * SIZE + x, free.length); free.push([x, y]); }
    const overlay = this.overlay = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      additive({}),
      free.length);
    free.forEach(([x, y], i) => { overlay.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.5, 0.004, y + 0.5), q, one)); overlay.setColorAt(i, new THREE.Color(0)); });
    this.overlayNow = free.map(() => new THREE.Color(0));
    this.overlayTarget = free.map(() => new THREE.Color(0));
    scene.add(overlay);

    // Dust drifting in the air.
    const n = 420, dust = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) dust.set([rnd() * SIZE, 0.05 + rnd() * 1.3, rnd() * SIZE], i * 3);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    this.dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
      size: 0.018, color: hdr(0xa9bde6, 0.9), map: this.glow, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dustBase = dust.slice();
    scene.add(this.dust);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8aa2d8, 0x07080c, 1.1));
    const spot = this.spot = new THREE.SpotLight(0xffeedd, 4.5, 14, Math.PI / 3.6, 0.75, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.05;
    spot.position.set(0.06, 0.02, 0);
    spot.target.position.set(0, -0.08, -1);
    this.camera.add(spot, spot.target);
    const fill = new THREE.PointLight(0x7d95ff, 0.5, 2.6, 2);
    this.camera.add(fill);
    this.impactLight = new THREE.PointLight(BEAM, 0, 3.5, 2);
    this.scene.add(this.impactLight);
    // A few lights follow the nearest glowing things (monsters, fireballs). Their number never
    // changes, as adding a light recompiles every shader, and each one costs every lit pixel.
    this.glowLights = Array.from({ length: 6 }, () => new THREE.PointLight(FIRE, 0, 3.5, 2));
    this.scene.add(...this.glowLights);
  }

  buildWeapon() {
    // Drawn in its own pass with a cleared depth buffer (classic FPS trick).
    const s = this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 5);
    s.add(new THREE.HemisphereLight(0xaebfe6, 0x0a0b10, 0.9));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.8);
    key.position.set(-1.2, 2, 1.5);
    s.add(key);
    const rim = new THREE.DirectionalLight(0x6f8fff, 1.2);
    rim.position.set(2, 0.5, -1);
    s.add(rim);
    s.environment = this.scene.environment;
    s.environmentIntensity = 0.35;

    // Matte ceramic shell, dark mechanics, a single thin amber accent.
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x8d96a6, roughness: 0.55, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.45, metalness: 0.7 });
    const glow = new THREE.MeshBasicMaterial({ color: hdr(BEAM, 1.3), toneMapped: false });
    this.weaponGlow = glow;
    const g = this.weapon = new THREE.Group();
    const add = (geo, mat, pos, rot = [0, 0, 0]) => { const o = new THREE.Mesh(geo, mat); o.position.set(...pos); o.rotation.set(...rot); g.add(o); return o; };
    add(new THREE.BoxGeometry(0.062, 0.066, 0.25), shell, [0, 0, 0]);                          // receiver
    add(new THREE.BoxGeometry(0.066, 0.026, 0.15), dark, [0, -0.012, -0.02]);                  // side inset
    add(new THREE.BoxGeometry(0.024, 0.02, 0.1), dark, [0, 0.043, 0.02]);                       // sight
    add(new THREE.BoxGeometry(0.044, 0.11, 0.05), dark, [0, -0.08, 0.075], [0.3, 0, 0]);         // grip
    add(new THREE.BoxGeometry(0.05, 0.05, 0.09), shell, [0, 0.004, -0.165]);                    // shroud
    add(new THREE.CylinderGeometry(0.013, 0.015, 0.09, 20), dark, [0, 0.004, -0.24], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.003, 0.006, 0.17), glow, [0.0335, 0.012, -0.03]);               // accent
    this.muzzle = new THREE.Vector3(0, 0.004, -0.29);
    this.muzzleFlash = new THREE.PointLight(BEAM, 0, 1.5, 2);
    this.muzzleFlash.position.copy(this.muzzle);
    g.add(this.muzzleFlash);
    g.position.set(0.2, -0.18, -0.4);
    g.rotation.y = 0.07;
    g.scale.setScalar(0.72);
    this.weaponRest = g.position.clone();
    this.recoil = 0;
    s.add(g);
  }

  /* ─────────────── Items and fireballs ─────────────── */

  /* A soft halo, for monsters, items and fireballs. */
  glowSprite(color, opacity, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  }

  makeItem(kind) {
    const g = new THREE.Group();
    const color = kind === "ammo" ? GOLD : MINT;
    const mat = new THREE.MeshStandardMaterial({ color: 0x100a02, emissive: color, emissiveIntensity: 2.6, roughness: 0.25, metalness: 0.3 });
    if (kind === "ammo") {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat);
      crystal.scale.set(1, 1.8, 1);
      g.add(crystal);
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), mat), new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mat));
    }
    g.add(this.glowSprite(color, 0.45, 0.6));
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.17, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: hdr(color, 2), toneMapped: false, transparent: true, opacity: 0.8 }));
    return { g, pad, taken: false, fade: 1, phase: Math.random() * 6 };
  }

  /* A fixed pool of fireballs, reused from one shot to the next. */
  buildFireballs() {
    this.fireballs = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: hdr(0xffe0a8, 5), toneMapped: false })),
            this.glowSprite(FIRE, 0.95, 0.55), this.glowSprite(0xff3a10, 0.35, 1.3));
      g.visible = false;
      this.scene.add(g);
      this.fireballs.push({ g, id: null });
    }
  }

  /* Rebuild the dynamic part of the scene for a new game. */
  reset(world) {
    const old = [...[...this.enemies.values()].flatMap(e => [e.g, e.pool]),
                 ...[...this.items.values()].flatMap(it => [it.g, it.pad]), ...this.decals.flatMap(d => [d.mark, d.glow])];
    for (const o of old) { this.scene.remove(o); dispose(o); }
    this.enemies.clear(); this.items.clear(); this.decals = [];
    for (const e of world.enemies) {
      const v = SPECIES[e.kind](this);
      this.scene.add(v.g, v.pool);
      this.enemies.set(e.id, v);
    }
    for (const it of world.items) {
      const v = this.makeItem(it.kind);
      v.g.position.set(it.x + 0.5, 0.3, it.y + 0.5);
      v.pad.position.set(it.x + 0.5, 0.006, it.y + 0.5);
      this.scene.add(v.g, v.pad);
      this.items.set(it.id, v);
    }
    const p = world.player;
    this.view = { x: p.x, y: p.y, turns: p.dir, dir: p.dir, fromX: p.x, fromY: p.y, fromYaw: -p.dir * Math.PI / 2, t: 1, dur: MOVE_TIME, moving: false };
    this.view.yaw = this.view.fromYaw;
    for (const c of this.overlayTarget) c.setRGB(0, 0, 0);
    this.update(world, 0);                          // also puts the fireballs back in the pool
  }

  /* ─────────────── Events from the game ─────────────── */

  handle(ev, world) {
    const e = ev.enemy !== undefined ? this.enemies.get(ev.enemy) : null;
    if (ev.type === "shot") {
      const from = this.camera.localToWorld(this.muzzle.clone().multiplyScalar(this.weapon.scale.x).add(this.weaponRest));
      // Shots fly straight along the robot's line: a hit lands on that line at the monster's depth,
      // a miss on the wall face, nudged toward the player so the sparks stay visible.
      const p = world.player, [dx, dy] = DIRS[p.dir];
      let target;
      if (ev.hit) {
        const m = this.enemyPosition(ev.enemy), depth = relative(p, m.x - 0.5, m.z - 0.5).f;
        target = new THREE.Vector3(p.x + 0.5 + dx * depth, m.y, p.y + 0.5 + dy * depth);
      } else target = new THREE.Vector3(ev.x + 0.5 - dx * 0.02, EYE - 0.02, ev.y + 0.5 - dy * 0.02);
      this.beam(from, target);
      this.recoil = 1;
      this.muzzleFlash.intensity = 6;
      this.impactLight.color.setHex(ev.hit ? 0xff5470 : BEAM);
      this.impactLight.position.copy(target);
      this.impactLight.intensity = ev.hit ? 5 : 3;
      this.particles.burst(target, ev.hit
        ? { count: 26, color: 0xff5470, speed: 2.4, life: 0.5, intensity: 4 }
        : { count: 22, color: BEAM, speed: 1.8, life: 0.45, intensity: 3 });
      if (e) {
        e.hit = 1;
        e.kick = 1;
        if (ev.killed) this.explode(ev.enemy);
      }
    } else if ((ev.type === "fireball" || ev.type === "bite") && e) {
      e.attack();
    } else if (ev.type === "impact") {
      const pos = new THREE.Vector3(ev.x + 0.5, FIREBALL_Y, ev.y + 0.5);
      this.particles.burst(pos, { count: ev.hit ? 30 : 55, color: FIRE, speed: 2.2, life: 0.55, size: 0.06, intensity: 3.5 });
      this.particles.burst(pos, { count: 20, color: 0xffe0a0, speed: 1.1, life: 0.35, size: 0.05, gravity: -0.5, intensity: 3 });
      this.impactLight.color.setHex(FIRE);
      this.impactLight.position.copy(pos);
      this.impactLight.intensity = 7;
    } else if (ev.type === "wake" && e) {
      e.hit = Math.max(e.hit, 0.35);
    } else if (ev.type === "hurt") {
      this.shake = Math.min(1, ev.amount / 12);
    } else if (ev.type === "pickup") {
      const it = this.items.get(ev.item);
      if (it) {
        it.taken = true;
        this.particles.burst(it.g.position, { count: 36, color: ev.kind === "ammo" ? GOLD : MINT, speed: 1.4, life: 0.8, gravity: -0.6, intensity: 2.5 });
      }
    }
  }

  explode(id) {
    const e = this.enemies.get(id);
    const pos = e.g.position.clone();
    for (const debris of e.debris) this.particles.burst(pos, debris);
    e.dying = 1;
    // Burn mark and dying embers on the floor.
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.tex.scorch, transparent: true, opacity: 0.9, depthWrite: false }));
    mark.rotation.y = Math.random() * Math.PI;
    mark.position.set(pos.x, 0.006, pos.z);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
      additive({ map: this.glow, color: hdr(FIRE, 2), opacity: 0.9 }));
    glow.position.set(pos.x, 0.008, pos.z);
    this.scene.add(mark, glow);
    this.decals.push({ mark, glow, life: 1 });
  }

  beam(from, to) {
    const dir = to.clone().sub(from), len = dir.length();
    const make = (radius, color, opacity) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true),
        additive({ color, opacity }));
      mesh.scale.y = len;
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.scene.add(mesh);
      return mesh;
    };
    this.beams.push({ meshes: [make(0.006, hdr(0xfff1d6, 6), 1), make(0.028, hdr(BEAM, 2.2), 0.45)], life: 0.22 });
  }

  enemyPosition(id) {
    const e = this.enemies.get(id);
    return e ? e.g.position.clone() : new THREE.Vector3();
  }

  /* Screen position (CSS pixels) of an enemy, for the lock-on reticle. */
  screenPosition(id) {
    const v = this.enemyPosition(id).project(this.camera);
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height, visible: v.z < 1 && Math.abs(v.x) < 1.05 };
  }

  /* Light up the cells the sensors describe. */
  showPerception(p, world) {
    for (const c of this.overlayTarget) c.setRGB(0, 0, 0);
    if (!p) return;
    const pl = world.player;
    const set = (x, y, color, k) => {
      const i = this.cellIndex.get(y * SIZE + x);
      if (i !== undefined) this.overlayTarget[i].copy(new THREE.Color(color).multiplyScalar(k));
    };
    const rays = [["ahead", 0, 0.12], ["right", 1, 0.06], ["behind", 2, 0.04], ["left", 3, 0.06]];
    for (const [side, turn, k] of rays) {
      const [dx, dy] = DIRS[(pl.dir + turn) % 4];
      const s = p.sides[side];
      for (let n = 1; n <= s.free; n++) set(pl.x + dx * n, pl.y + dy * n, s.unexplored ? 0x6fb7ff : BEAM, k * (1 - n / (s.free + 3)));
    }
    for (const o of p.openings) set(o.x, o.y, o.unexplored ? 0x6fb7ff : BEAM, 0.2);
    if (p.crosshair) set(p.crosshair.x, p.crosshair.y, RED, 0.35);
  }

  /* ─────────────── Frame ─────────────── */

  update(world, dt) {
    this.time += dt;
    const t = this.time, p = world.player, v = this.view;

    // Player: ease toward the new cell / orientation.
    if (p.x !== v.x || p.y !== v.y || p.dir !== v.dir) {
      const turn = (p.dir - v.dir + 4) % 4;
      v.fromX = v.cx ?? v.x; v.fromY = v.cy ?? v.y; v.fromYaw = v.yaw;
      v.moving = p.x !== v.x || p.y !== v.y;
      v.turns += turn === 3 ? -1 : turn;
      v.x = p.x; v.y = p.y; v.dir = p.dir;
      v.t = 0; v.dur = v.moving ? MOVE_TIME : TURN_TIME;
    }
    v.t = Math.min(1, v.t + dt / v.dur);
    const k = ease(v.t);
    v.cx = v.fromX + (v.x - v.fromX) * k;
    v.cy = v.fromY + (v.y - v.fromY) * k;
    v.yaw = v.fromYaw + (-v.turns * Math.PI / 2 - v.fromYaw) * k;
    const bob = v.moving ? Math.sin(v.t * Math.PI) * 0.022 : 0;
    this.shake = Math.max(0, this.shake - dt * 3.5);
    const sh = this.shake * this.shake * 0.05;
    // The eye sits slightly behind the cell centre: facing a wall, the corners stay in view.
    const back = 0.18;
    this.camera.position.set(
      v.cx + 0.5 - Math.sin(-v.yaw) * back + (Math.random() - 0.5) * sh,
      EYE + bob + (Math.random() - 0.5) * sh,
      v.cy + 0.5 + Math.cos(-v.yaw) * back);
    this.camera.rotation.set(0, v.yaw, 0);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);

    // Weapon: idle sway, walk bob, recoil.
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const r = this.recoil;
    this.weapon.position.set(
      this.weaponRest.x + Math.sin(t * 1.3) * 0.004,
      this.weaponRest.y + Math.sin(t * 2.1) * 0.003 - bob * 0.35 + r * 0.012,
      this.weaponRest.z + r * 0.06);
    this.weapon.rotation.x = r * 0.12;
    this.weaponGlow.color.copy(hdr(BEAM, 1.3 + r * 4));
    this.muzzleFlash.intensity *= Math.exp(-dt * 18);
    this.impactLight.intensity *= Math.exp(-dt * 10);

    // Monsters glide along the path the game computes, in game time: in turn-based mode they
    // freeze mid-stride while the model thinks.
    const cam = this.camera.position, glowing = [];
    for (const e of world.enemies) {
      const v = this.enemies.get(e.id);
      if (!v) continue;
      const k = e.stepTime > 0 ? 1 - e.step / e.stepTime : 1;
      const x = e.fromX + (e.x - e.fromX) * k + 0.5, z = e.fromY + (e.y - e.fromY) * k + 0.5;
      const awake = e.awake && e.alive;
      v.g.position.set(x, v.hover(t), z);
      v.pool.position.set(x, 0.005, z);
      // Awake, it stares at the robot; asleep, it slowly looks around.
      const target = awake ? Math.atan2(cam.x - x, cam.z - z) : v.idleYaw + Math.sin(t * 0.25 + v.phase) * 0.9;
      v.yaw = approach(v.yaw, v.yaw + wrap(target - v.yaw), awake ? 7 : 1.2, dt);
      v.g.rotation.y = v.yaw;
      v.hit = Math.max(0, v.hit - dt * 5);
      v.kick = Math.max(0, v.kick - dt * 4);
      v.flash.material.opacity = v.hit * 0.75;
      v.flash.visible = v.hit > 0;
      const glow = v.animate(e, t, dt, awake);            // light and floor glow

      if (v.dying !== undefined) {
        v.dying = Math.max(0, v.dying - dt * 2.4);
        v.g.scale.setScalar(Math.max(0.001, v.dying * (1 + (1 - v.dying) * 0.7)));
        v.lightLevel = 6 * v.dying;
        v.pool.material.opacity = 0.5 * v.dying;
        if (v.dying === 0) v.g.visible = v.pool.visible = false;
      } else {
        v.lightLevel = 1.2 * glow + v.hit * 3;
        v.pool.material.opacity = 0.25 + 0.25 * glow;
      }
      if (v.lightLevel > 0) glowing.push({ pos: v.g.position, color: v.lightColor, intensity: v.lightLevel, distance: 3.4 });
    }

    // Fireballs, from a fixed pool.
    const flying = new Set(world.projectiles.map(b => b.id));
    for (const f of this.fireballs) if (f.id !== null && !flying.has(f.id)) { f.id = null; f.g.visible = false; }
    for (const b of world.projectiles) {
      const f = this.fireballs.find(f => f.id === b.id) || this.fireballs.find(f => f.id === null);
      if (!f) continue;
      f.id = b.id;
      f.g.visible = true;
      f.g.position.set(b.x + 0.5, FIREBALL_Y, b.y + 0.5);
      glowing.push({ pos: f.g.position, color: FIRE, intensity: 2.4 + Math.random() * 0.8, distance: 3.6 });
      if (dt > 0) this.particles.burst(f.g.position, { count: 2, color: FIRE, ember: 0.4, speed: 0.3, life: 0.35, size: 0.08, gravity: -0.5, intensity: 2.4 });
    }

    // The light pool goes to the glowing things nearest the camera.
    glowing.sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam));
    this.glowLights.forEach((light, i) => {
      const src = glowing[i];
      light.intensity = src ? src.intensity : 0;
      if (!src) return;
      light.position.set(src.pos.x, src.pos.y + 0.05, src.pos.z);
      light.color.setHex(src.color);
      light.distance = src.distance;
    });

    // Burn marks: the embers fade, the scorch stays.
    for (const d of this.decals) {
      d.life = Math.max(0, d.life - dt * 0.35);
      d.glow.material.opacity = 0.9 * d.life * (0.8 + Math.random() * 0.2);
      d.glow.visible = d.life > 0;
    }

    // Items.
    for (const it of this.items.values()) {
      it.g.rotation.y += dt * 1.4;
      it.g.position.y = 0.3 + Math.sin(t * 2.2 + it.phase) * 0.04;
      if (it.taken && it.fade > 0) {
        it.fade = Math.max(0, it.fade - dt * 3);
        it.g.scale.setScalar(1 + (1 - it.fade) * 1.5);
        it.g.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = it.fade; } });
        it.pad.material.opacity = 0.8 * it.fade;
        if (it.fade === 0) it.g.visible = it.pad.visible = false;
      }
    }

    // Beams fade out.
    this.beams = this.beams.filter(b => {
      b.life -= dt;
      for (const m of b.meshes) m.material.opacity *= Math.exp(-dt * 16);
      if (b.life > 0) return true;
      for (const m of b.meshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
      return false;
    });

    // Perception overlay eases toward its target.
    const a = 1 - Math.exp(-dt * 8);
    this.overlayNow.forEach((c, i) => { c.lerp(this.overlayTarget[i], a); this.overlay.setColorAt(i, c); });
    this.overlay.instanceColor.needsUpdate = true;

    // Dust drifts.
    const d = this.dust.geometry.attributes.position;
    for (let i = 0; i < d.count; i++) {
      d.array[i * 3] = this.dustBase[i * 3] + Math.sin(t * 0.13 + i) * 0.18;
      d.array[i * 3 + 1] = this.dustBase[i * 3 + 1] + Math.sin(t * 0.21 + i * 1.7) * 0.08;
    }
    d.needsUpdate = true;

    this.particles.update(dt);
  }

  render() {
    this.weaponCamera.position.set(0, 0, 0);
    this.composer.render();
  }
}
