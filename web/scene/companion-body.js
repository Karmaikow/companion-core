import { WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, ConeGeometry, TubeGeometry, CatmullRomCurve3, Vector3, TorusGeometry, Shape, ExtrudeGeometry, MeshStandardMaterial, MeshBasicMaterial, HemisphereLight, DirectionalLight, Color, ACESFilmicToneMapping, DoubleSide } from 'three';

const bound = (n, lo, hi, fallback) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;

/** A small, real 3D mesh. No textures, network downloads, shadows or AI generation. */
export class CompanionBodyRenderer {
  mount(host) {
    this.host = host;
    try {
      this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0, 0);
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.3;
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'companion-body-canvas';
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'Espírito místico nascente em 3D');
      this.canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:1;';
      host.append(this.canvas);
      this.scene = new Scene();
      this.scene.add(new HemisphereLight(0xc5e8ff, 0x102038, 2.5));
      const key = new DirectionalLight(0xffffff, 3); key.position.set(-3, 5, 4); this.scene.add(key);
      const rim = new DirectionalLight(0x8ab7ff, 2); rim.position.set(3, 2, -3); this.scene.add(rim);
      this.camera = new PerspectiveCamera(42, 1, .1, 30);
      this.camera.position.set(0, 1.3, 5.8); this.camera.lookAt(0, .3, 0);
      this.available = true;
      this.lost = event => { event.preventDefault(); this.available = false; this.canvas.hidden = true; host.dataset.bodyRenderer = 'fallback'; };
      this.restored = () => { this.available = true; this.canvas.hidden = false; host.dataset.bodyRenderer = 'webgl2'; };
      this.canvas.addEventListener('webglcontextlost', this.lost);
      this.canvas.addEventListener('webglcontextrestored', this.restored);
      host.dataset.bodyRenderer = 'webgl2';
    } catch { this.available = false; host.dataset.bodyRenderer = 'fallback'; }
  }

  setRecipe(recipe) {
    if (!this.renderer || this.signature === JSON.stringify(recipe)) return;
    this.signature = JSON.stringify(recipe); this.disposeModel();
    const hex = /^#[0-9a-f]{6}$/i.test(recipe.soulColor || '') ? recipe.soulColor : '#3f8cff';
    const color = new Color(hex);
    const accent = new Color(/^#[0-9a-f]{6}$/i.test(recipe.markingColor || "") ? recipe.markingColor : hex);
    const body = new MeshStandardMaterial({ color, roughness: .68, metalness: .12, flatShading: true });
    const pale = new MeshStandardMaterial({ color: color.clone().lerp(new Color('#eefaff'), .72), roughness: .7, flatShading: true });
    const dark = new MeshStandardMaterial({ color: '#071124', roughness: .4 });
    const white = new MeshStandardMaterial({ color: '#effbff', roughness: .4 });
    const light = new MeshStandardMaterial({ color:accent, emissive:accent, emissiveIntensity: .65, roughness: .5, flatShading: true });
    this.model = new Group(); this.model.name = 'FormaNascente'; this.scene.add(this.model);
    const mesh = (geometry, material, position, scale = [1, 1, 1], parent = this.model) => {
      const object = new Mesh(geometry, material); object.position.set(...position); object.scale.set(...scale); parent.add(object); return object;
    };
    const sphere = (material, position, scale) => mesh(new SphereGeometry(1, 16, 12), material, position, scale);
    sphere(body, [0, -.05, 0], [.66, .8, .54]);
    const headSize = bound(recipe.headSize, .9, 1.1, 1);
    sphere(body, [0, .94, .12], [.69 * headSize, .62 * headSize, .57 * headSize]);
    sphere(pale, [0, .72, .57], [.32, .22, .16]);
    sphere(dark, [0, .85, .72], [.08, .055, .045]);
    for (const side of [-1, 1]) {
      sphere(pale, [side * .37, -.7, .24], [.25, .24, .32]);
      sphere(body, [side * .61, .02, .15], [.17, .35, .2]);
      sphere(white, [side * .27, 1.04, .64], [.16, .2, .07]);
      sphere(dark, [side * .27, 1.03, .704], [.085, .135, .045]);
      sphere(white, [side * .25, 1.08, .743], [.028, .038, .018]);
    }
    const tailLength = bound(recipe.tailLength, .8, 1.25, 1);
    const tailPath = new CatmullRomCurve3([new Vector3(0, -.4, -.42), new Vector3(.5, -.5, -.7), new Vector3(.9 * tailLength, -.15, -.5), new Vector3(.95 * tailLength, .2, -.32)]);
    mesh(new TubeGeometry(tailPath, 16, .12, 6, false), body, [0, 0, 0]);
    sphere(light, [.95 * tailLength, .2, -.32], [.19, .23, .19]);
    const archetype = recipe.archetype;
    if (archetype === 'WINGED' || archetype === 'DRACONIC') {
      this.wings = [];
      const shape = new Shape(); shape.moveTo(0, 0); shape.lineTo(.6, .75); shape.lineTo(.8, .35); shape.lineTo(.7, -.05); shape.lineTo(.35, -.15); shape.closePath();
      const wingMaterial = new MeshStandardMaterial({ color: accent.clone().lerp(new Color('#badaff'), .35), roughness: .75, side: DoubleSide, flatShading: true });
      for (const side of [-1, 1]) {
        const wing = new Group(); wing.position.set(side * .5, .25, -.25); wing.scale.x = side;
        mesh(new ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false }), wingMaterial, [0, 0, 0], [1, 1, 1], wing);
        this.model.add(wing); this.wings.push(wing);
      }
      mesh(new ConeGeometry(.17, .36, 6), pale, [0, 1.63, 0]);
    } else {
      const earLength = bound(recipe.earLength, .45, .75, .6);
      for (const side of [-1, 1]) {
        const ear = mesh(new ConeGeometry(.22, earLength, 6), body, [side * .48, 1.51, .02]); ear.rotation.z = -side * .22;
        const earInner = mesh(new ConeGeometry(.11, earLength * .72, 5), pale, [side * .48, 1.5, .17]); earInner.rotation.z = -side * .22;
      }
      if (archetype === 'GUARDIAN') for (const side of [-1, 1]) mesh(new ConeGeometry(.1, bound(recipe.hornSize, .18, .32, .25), 6), pale, [side * .23, 1.62, -.1]);
    }
    if (archetype === 'DRACONIC') for (const side of [-1,1]) mesh(new ConeGeometry(.12,.38,6),pale,[side*.37,1.6,-.04]);
    if (archetype === 'SPECTRAL') {
      body.transparent=true;body.opacity=.7;body.emissive=color;body.emissiveIntensity=.2;
      mesh(new ConeGeometry(.48,.8,12),body,[0,-.7,0]);
    }
    const gem = mesh(new ConeGeometry(.12, .3, 4), light, [0, .17, .56]); gem.rotation.x = Math.PI / 2;
    const ring = mesh(new TorusGeometry(.78, .012, 6, 48), new MeshBasicMaterial({ color: color.clone().lerp(new Color('#b0dbff'), .35) }), [0, -.98, 0]); ring.rotation.x = Math.PI / 2;
    this.model.rotation.y = -.18;
  }

  resize(width, height, dpr, x, y) {
    if (!this.renderer) return;
    const size = Math.round(Math.min(330, Math.max(170, width * .7), height * .55));
    const stamp = `${size}:${Math.min(dpr || 1,1.25)}`;
    if(this.sizeStamp!==stamp) { this.renderer.setPixelRatio(Math.min(dpr || 1, 1.25));this.renderer.setSize(size,size,false);this.sizeStamp=stamp; }
    Object.assign(this.canvas.style, { width: size + 'px', height: size + 'px', left: (x - size / 2) + 'px', top: (y - size / 2) + 'px' });
  }

  render(time, hover, thinking) {
    if (!this.available || !this.model) return;
    this.model.rotation.y = -.18 + Math.sin(time * .00035) * .26;
    this.model.position.y = Math.sin(time * .0014) * .045;
    this.model.scale.setScalar(1 + hover * .035 + (thinking ? .015 : 0));
    this.wings?.forEach((wing, i) => { wing.rotation.y = Math.sin(time * .0015) * .12 * (i ? 1 : -1); });
    this.renderer.render(this.scene, this.camera);
  }

  disposeModel() {
    if (!this.model) return;
    const materials = new Set();
    this.model.traverse(object => { if (object.isMesh) { object.geometry.dispose(); materials.add(object.material); } });
    materials.forEach(material => material.dispose()); this.scene.remove(this.model); this.model = null; this.wings = null;
  }
  destroy() {
    this.disposeModel(); this.canvas?.removeEventListener('webglcontextlost', this.lost); this.canvas?.removeEventListener('webglcontextrestored', this.restored);
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.canvas?.remove();
  }
}
