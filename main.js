// ============================================================
//  Zappar Universal AR + Three.js
//  Image tracking: plagát → video overlay
// ============================================================

// Konfigurácia: zoznam plagátov (zpt target + video)
const POSTERS = [
  { id: "plagat1", target: "targets/plagat1.zpt", video: "videos/plagat1.mp4" },
  { id: "plagat2", target: "targets/plagat2.zpt", video: "videos/plagat2.mp4" },
  { id: "plagat3", target: "targets/plagat3.zpt", video: "videos/plagat3.mp4" },
  // ... pridaj ďalšie
];

// --- Three.js setup ---
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Zappar potrebuje WebGL context
ZapparThree.glContextSet(renderer.getContext());

// Kamera (Zappar wrapper, nie THREE.PerspectiveCamera)
const camera = new ZapparThree.Camera();
scene.background = camera.backgroundTexture;

// Svetlo (pre prípadné 3D objekty, video plane ho nepotrebuje)
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

// --- Grace-period pre video pause (rieši iOS koktanie) ---
const GRACE_MS = 400;

// --- Handler pre jeden plagát ---
class PosterTracker {
  constructor(config, scene, camera) {
    this.config = config;
    this.visible = false;
    this.graceTimer = null;
    this.videoStarted = false;

    // Načítaj .zpt target
    this.tracker = new ZapparThree.ImageTrackerLoader().load(config.target);

    // Anchor group — sem pridáme video plane
    this.anchorGroup = new ZapparThree.ImageAnchorGroup(camera, this.tracker);
    scene.add(this.anchorGroup);

    // Vytvor video element (skrytý, ako textúru)
    this.video = this._createVideo(config.video);
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    // Plane presne veľkosť plagátu (1×1 v anchor súradniciach = fyzická veľkosť)
    // Zappar image anchor má implicitnú veľkosť ~1 jednotka = šírka obrázka
    const geometry = new THREE.PlaneGeometry(1, 1); // uprav pomer podľa plagátu
    const material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });
    this.plane = new THREE.Mesh(geometry, material);
    this.plane.position.z = 0.001; // mierne nad plagátom, aby nedošlo k z-fight
    this.anchorGroup.add(this.plane);

    // Event handlery
    this.tracker.onVisible.bind(() => this._onVisible());
    this.tracker.onNotVisible.bind(() => this._onNotVisible());
  }

  _createVideo(src) {
    const v = document.createElement("video");
    v.src = src;
    v.loop = true;
    v.muted = true; // iOS vyžaduje muted pre autoplay
    v.playsInline = true; // iOS: nepouži fullscreen
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.load();
    return v;
  }

  _onVisible() {
    // Zruš grace-period (ak bežala)
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.visible = true;
    this.plane.visible = true;

    // Spusti video (len raz, potom len play)
    if (!this.videoStarted) {
      this.video
        .play()
        .then(() => {
          this.videoStarted = true;
        })
        .catch((e) => console.warn("Video play failed:", e));
    } else {
      this.video.play().catch(() => {});
    }
  }

  _onNotVisible() {
    this.visible = false;
    // Nezatvávaj okamžite — počkaj grace-period
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      if (!this.visible) {
        this.plane.visible = false;
        this.video.pause();
      }
    }, GRACE_MS);
  }
}

// --- Načítaj všetky plagáty ---
const trackers = POSTERS.map((cfg) => new PosterTracker(cfg, scene, camera));

// --- Resize handler ---
window.addEventListener("resize", () => {
  camera.updateFrame(renderer); // Zappar interný update
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ---
function animate() {
  requestAnimationFrame(animate);
  camera.updateFrame(renderer);
  renderer.render(scene, camera);
}

// --- Štart: po kliku na tlačidlo (iOS vyžaduje user gesture) ---
document.getElementById("startBtn").addEventListener("click", () => {
  ZapparThree.permissionRequestUI().then((granted) => {
    if (granted) {
      camera.start();
      document.getElementById("ui").classList.add("hidden");
      document.getElementById("hint").classList.remove("hidden");
      animate();
    } else {
      ZapparThree.permissionDeniedUI();
    }
  });
});
