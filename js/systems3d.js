/* ============================================================================
   systems3d.js  —  procedural 3D walkaround airplane + exploded IO-360.
   window.Systems3D = { supported, load, ids, mount }.

   three.js r128 (classic global) is injected lazily by load(); nothing here
   touches the CDN until a caller asks. Everything is built from primitives —
   no textures or assets. One shared WebGL renderer draws every view and each
   view copies the frame into its own 2D canvas, so mounting/unmounting never
   churns GL contexts. Rendering is on demand (drag, animation, dirty) and
   pauses off-screen.

   Frame: feet, +X forward, +Y up, +Z = pilot's RIGHT. Pitot, stall inlet,
   static port and the underwing fuel vent are on -Z (left). The propeller
   turns clockwise seen from the cockpit, which is positive rotation about +X.
   Shapes are illustrative. The hotspot table for the airplane lives in
   sysdiag-air.js (SysDiagrams.hotspots) so the 2D locator shares its ids.
   ========================================================================== */

const Systems3D = (() => {
  const URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const SRI = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
  const AFR = () => (typeof SysDiagrams !== "undefined" && SysDiagrams.airframe) || null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------- engine hotspots ---------------------------- */
  const EH = (id, label, r) => ({ id, label, r, sys: id.split(".")[0], part: id.split(".")[1] });
  const ENGINE_HOT = [
    EH("engine.cylinder", "Cylinder", 0.5), EH("engine.piston", "Piston + rod", 0.4), EH("engine.crank", "Crankshaft", 0.4),
    EH("engine.manifold", "Intake manifold", 0.35), EH("engine.airFilter", "Air filter", 0.45), EH("engine.servo", "Fuel/air control unit", 0.35),
    EH("engine.exhaust", "Exhaust", 0.4), EH("engine.muffler", "Muffler", 0.35),
    EH("fuel.divider", "Flow divider", 0.3), EH("fuel.nozzles", "Injector nozzle", 0.3),
    EH("ignition.magL", "Left mag", 0.35), EH("ignition.magR", "Right mag", 0.35), EH("ignition.plugs", "Spark plugs", 0.25), EH("ignition.starter", "Starter", 0.35),
    EH("electrical.alternator", "Alternator + belt", 0.4), EH("oil.sump", "Oil sump", 0.4), EH("oil.filter", "Oil filter", 0.3), EH("oil.dipstick", "Dipstick", 0.25),
    EH("prop.hub", "Prop flange", 0.3), EH("prop.blade", "Propeller", 0.5), EH("prop.spinner", "Spinner", 0.35),
  ];

  /* -------------------------------- probes -------------------------------- */
  let supportedCache = null;
  function supported() {
    if (supportedCache !== null) return supportedCache;
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
      supportedCache = !!gl;
      const lose = gl && gl.getExtension && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (e) { supportedCache = false; }
    return supportedCache;
  }

  let loadP = null;
  function load() {
    if (loadP) return loadP;
    loadP = new Promise((resolve) => {
      if (!supported()) return resolve(false);
      if (window.THREE && window.THREE.WebGLRenderer) return resolve(true);
      let done = false;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(timer); resolve(ok); };
      const sc = document.createElement("script");
      sc.src = URL; sc.integrity = SRI; sc.crossOrigin = "anonymous";
      sc.onload = () => fin(!!(window.THREE && window.THREE.WebGLRenderer));
      sc.onerror = () => fin(false);
      const timer = setTimeout(() => fin(false), 5000);
      try { document.head.appendChild(sc); } catch (e) { fin(false); }
    });
    return loadP;
  }

  function ids(scene) {
    const src = scene === "engine" ? ENGINE_HOT : scene === "airplane" && typeof SysDiagrams !== "undefined" && SysDiagrams.hotspots ? SysDiagrams.hotspots : [];
    return src.map((h) => ({ id: h.id, sys: h.sys, part: h.part }));
  }

  /* ---------------------------- shared renderer ---------------------------- */
  let renderer = null;
  function getRenderer(T) {
    if (renderer) return renderer;
    try {
      const c = document.createElement("canvas");
      const r = new T.WebGLRenderer({ canvas: c, antialias: true, alpha: false, powerPreference: "low-power" });
      r.setPixelRatio(1);
      r.setClearColor(0x10161d, 1);
      r.localClippingEnabled = true;
      c.addEventListener("webglcontextlost", (e) => { e.preventDefault(); renderer = null; });
      renderer = r;
    } catch (e) { renderer = null; }
    return renderer;
  }

  /* ------------------------------ geometry utils ------------------------------ */
  // Cubic-Hermite interpolation of column k of a table sorted by x.
  function interp(tab, x, k) {
    const n = tab.length;
    if (x <= tab[0][0]) return tab[0][k];
    if (x >= tab[n - 1][0]) return tab[n - 1][k];
    let i = 0;
    while (x > tab[i + 1][0]) i++;
    const x0 = tab[i][0], x1 = tab[i + 1][0], h = x1 - x0, t = (x - x0) / h, y0 = tab[i][k], y1 = tab[i + 1][k];
    const m0 = i > 0 ? (y1 - tab[i - 1][k]) / (x1 - tab[i - 1][0]) : (y1 - y0) / h;
    const m1 = i + 2 < n ? (tab[i + 2][k] - y0) / (tab[i + 2][0] - x0) : (y1 - y0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
  }

  // Skin: rings of [x,y,z] points → BufferGeometry (closed rings wrap; caps optional).
  function loft(T, rings, closed, caps) {
    const nR = rings[0].length, pos = [], idx = [];
    rings.forEach((r) => r.forEach((p) => pos.push(p[0], p[1], p[2])));
    const last = closed ? nR : nR - 1;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < last; j++) {
        const a = i * nR + j, b = i * nR + (j + 1) % nR, c = (i + 1) * nR + j, d = (i + 1) * nR + (j + 1) % nR;
        idx.push(a, c, b, b, c, d);
      }
    }
    if (caps && closed) {
      [0, rings.length - 1].forEach((ri, ci) => {
        const ring = rings[ri], c = [0, 0, 0];
        ring.forEach((p) => { c[0] += p[0] / nR; c[1] += p[1] / nR; c[2] += p[2] / nR; });
        const ci0 = pos.length / 3;
        pos.push(c[0], c[1], c[2]);
        for (let j = 0; j < nR; j++) { const a = ri * nR + j, b = ri * nR + (j + 1) % nR; ci ? idx.push(ci0, a, b) : idx.push(ci0, b, a); }
      });
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Superellipse cross-section point (th from the top, + toward +Z).
  function ringPt(w, top, bot, th, n) {
    const s = Math.sin(th), c = Math.cos(th), e = 2 / n;
    const z = w * Math.sign(s) * Math.pow(Math.abs(s), e);
    const y = c >= 0 ? top * Math.pow(c, e) : bot * Math.pow(-c, e);
    return [z, y];
  }
  const D2R = Math.PI / 180;

  // Airfoil ring (NACA-like 2412) for chord fractions [f0,f1] at a section.
  function airfoil(f0, f1, N, camber) {
    const up = [], lo = [], m = camber ? 0.02 : 0, p = 0.4, t = camber ? 0.12 : 0.09;
    const full = f0 === 0 && f1 === 1;
    for (let i = 0; i <= N; i++) {
      const u = i / N, f = full ? 0.5 * (1 - Math.cos(Math.PI * u)) : f0 + (f1 - f0) * u;
      const yc = m ? (f < p ? (m / (p * p)) * (2 * p * f - f * f) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * f - f * f)) : 0;
      const yt = 5 * t * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f * f * f - 0.1036 * f * f * f * f);
      up.push([f, yc + yt]); lo.push([f, yc - yt]);
    }
    return up.reverse().concat(lo.slice(1, -1 + lo.length));
  }

  /* ------------------------------ scene toolkit ------------------------------ */
  function kit(T, ghost) {
    const R = { mats: [], tagged: [], cache: {}, plane: new T.Plane(new T.Vector3(0, -1, 0), 0.02), cut: false, ghost };
    R.mat = (sys, color, o = {}) => {
      const key = o.uniq ? null : [sys, color, o.skin ? 1 : 0, o.clip ? 1 : 0, o.op || 1, o.em || 0, o.metal || 0, o.rough || 0, o.dbl ? 1 : 0].join("|");
      if (key && R.cache[key]) return R.cache[key];
      const m = new T.MeshStandardMaterial({
        color, roughness: o.rough != null ? o.rough : 0.6, metalness: o.metal != null ? o.metal : 0.05,
        emissive: o.em || 0x000000, side: o.dbl ? T.DoubleSide : T.FrontSide, transparent: (o.op || 1) < 1, opacity: o.op || 1,
      });
      R.mats.push({ m, sys, skin: !!o.skin, clip: !!o.clip, base: o.op || 1, cur: 1, tgt: 1 });
      if (key) R.cache[key] = m;
      return m;
    };
    R.entry = (m) => R.mats.find((e) => e.m === m);
    R.tag = (obj, id) => { obj.traverse((o) => { if (o.isMesh) { o.userData.id = id; R.tagged.push(o); } }); return obj; };
    R.mesh = (geo, mat, parent, pos, rot, id) => {
      const m = new T.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (parent) parent.add(m);
      if (id) R.tag(m, id);
      return m;
    };
    R.rod = (a, b, r, mat, parent, id, seg = 10) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), len = d.length();
      const m = new T.Mesh(new T.CylinderGeometry(r, r, 1, seg), mat);
      m.position.copy(va).addScaledVector(d, 0.5);
      m.scale.y = len;
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      if (parent) parent.add(m);
      if (id) R.tag(m, id);
      return m;
    };
    R.tube = (pts, r, mat, parent, id, seg = 24) => {
      const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p))), seg, r, 6, false), mat);
      if (parent) parent.add(m);
      if (id) R.tag(m, id);
      return m;
    };
    return R;
  }

  /* ================================ ENGINE ================================ */
  // Local frame: crankshaft along +X (prop end +X), cylinders along ±Z, sump -Y.
  const CYL_X = [0.75, 0.25, -0.25, -0.75], CYL_SIDE = [1, -1, 1, -1], CYC = [0, 360, 180, 540];
  const CR = 0.18, CL = 0.55;              // crank throw radius, rod length
  const STROKES = [
    { n: "Power", c: 0xff5a36 }, { n: "Exhaust", c: 0x9aa7b4 }, { n: "Intake", c: 0x4dabf7 }, { n: "Compression", c: 0xf6c90e },
  ];

  function buildEngine(T, R, o = {}) {
    const g = new T.Group(), E = { group: g, anchors: {}, dyn: [], cyl: [], strokeIdx: [-1, -1, -1, -1] };
    const grey = (c, sys, x = {}) => R.mat(sys || "engine", c, { clip: x.clip, metal: 0.35, rough: 0.5, ...x });
    const anc = (parent, p) => { const a = new T.Object3D(); a.position.set(p[0], p[1], p[2]); parent.add(a); return a; };
    const grp = (parent, p) => { const q = new T.Group(); if (p) q.position.set(p[0], p[1], p[2]); parent.add(q); return q; };
    const mCase = grey(0x66727f, "engine", { clip: true, dbl: true });

    // crankcase halves + accessory case
    E.caseL = R.mesh(new T.BoxGeometry(2.0, 0.76, 0.5), mCase, g, [0, 0, -0.25]);
    E.caseR = R.mesh(new T.BoxGeometry(2.0, 0.76, 0.5), mCase, g, [0, 0, 0.25]);
    E.acc = R.mesh(new T.BoxGeometry(0.3, 0.74, 1.7), grey(0x7a8591, "engine"), g, [-1.15, 0.02, 0]);
    // sump
    E.sump = R.mesh(new T.BoxGeometry(1.7, 0.3, 0.7), grey(0xb98a3d, "oil", { clip: true, dbl: true }), g, [0, -0.55, 0], null, "oil.sump");
    E.anchors["oil.sump"] = anc(E.sump, [0, -0.1, 0.4]);

    /* --- crank (rotates) --- */
    E.crank = grp(g);
    const mCr = grey(0x5d6874, "engine", { metal: 0.6, rough: 0.35 });
    R.tag(R.mesh(new T.CylinderGeometry(0.09, 0.09, 2.3, 14), mCr, E.crank, [0.05, 0, 0], [0, 0, Math.PI / 2]), "engine.crank");
    E.anchors["engine.crank"] = anc(E.crank, [-0.5, 0, 0]);
    const beta0 = [];
    for (let k = 0; k < 4; k++) {
      const b = (90 + CYC[k] + (CYL_SIDE[k] < 0 ? 180 : 0)) * D2R;
      beta0.push(b);
      const y = CR * Math.cos(b), z = CR * Math.sin(b);
      R.tag(R.mesh(new T.CylinderGeometry(0.07, 0.07, 0.22, 12), mCr, E.crank, [CYL_X[k], y, z], [0, 0, Math.PI / 2]), "engine.crank");
      for (const dx of [-0.12, 0.12]) {
        const web = R.mesh(new T.BoxGeometry(0.045, 0.52, 0.2), mCr, E.crank, [CYL_X[k] + dx, (CR / 2 + 0.03) * Math.cos(b) , (CR / 2 + 0.03) * Math.sin(b)], [b, 0, 0]);
        R.tag(web, "engine.crank");
      }
    }
    // front: pulley (with the alternator group) and prop flange group (both rotate)
    E.pulleyGrp = grp(E.crank);
    R.mesh(new T.CylinderGeometry(0.25, 0.25, 0.08, 24), grey(0x4a5560, "electrical"), E.pulleyGrp, [1.0, 0, 0], [0, 0, Math.PI / 2]);
    E.frontGrp = grp(E.crank);
    if (o.prop !== false) {
      const mFl = grey(0x6a7683, "prop", { metal: 0.5 });
      R.tag(R.mesh(new T.CylinderGeometry(0.34, 0.34, 0.1, 28), mFl, E.frontGrp, [1.16, 0, 0], [0, 0, Math.PI / 2]), "prop.hub");
      E.anchors["prop.hub"] = anc(E.frontGrp, [1.16, 0.3, 0]);
      const mB = R.mat("prop", 0x20262d, { rough: 0.45 }), mTip = R.mat("prop", 0xf6c90e);
      for (const sg of [1, -1]) {
        const bl = grp(E.frontGrp, [1.3, 0, 0]);
        bl.rotation.x = sg > 0 ? 0 : Math.PI;
        const blade = grp(bl);
        blade.rotation.y = 0.35;
        R.tag(R.mesh(new T.BoxGeometry(0.07, 2.0, 0.3), mB, blade, [0, 1.15, 0]), "prop.blade");
        R.tag(R.mesh(new T.BoxGeometry(0.075, 0.2, 0.3), mTip, blade, [0, 2.05, 0]), "prop.blade");
        if (sg > 0) E.anchors["prop.blade"] = anc(blade, [0, 1.5, 0]);
      }
      const prof = [[0.01, 0.62], [0.2, 0.55], [0.4, 0.4], [0.5, 0.2], [0.55, 0]].map(([r, y]) => new T.Vector2(r, y));
      prof.unshift(new T.Vector2(0.55, 0.0)); prof.reverse();
      const sp = R.mesh(new T.LatheGeometry([new T.Vector2(0.55, 0), new T.Vector2(0.52, 0.22), new T.Vector2(0.42, 0.42), new T.Vector2(0.26, 0.6), new T.Vector2(0.1, 0.72), new T.Vector2(0.001, 0.76)], 28),
        R.mat("prop", 0x34ace0, { rough: 0.35 }), E.frontGrp, [1.22, 0, 0], [0, 0, -Math.PI / 2], "prop.spinner");
      E.anchors["prop.spinner"] = anc(E.frontGrp, [2.0, 0, 0]);
    }

    /* --- alternator + belt (front, rigid with the pulley group in x) --- */
    E.altGrp = grp(g);
    const altC = [0.55, -0.62];                       // (y, z)
    const mAlt = grey(0xd98a1f, "electrical", { metal: 0.2 });
    R.tag(R.mesh(new T.CylinderGeometry(0.15, 0.15, 0.34, 20), mAlt, E.altGrp, [1.0, altC[0], altC[1]], [0, 0, Math.PI / 2]), "electrical.alternator");
    R.tag(R.mesh(new T.CylinderGeometry(0.1, 0.1, 0.08, 16), grey(0x4a5560, "electrical"), E.altGrp, [1.0, altC[0], altC[1]], [0, 0, Math.PI / 2]), "electrical.alternator");
    R.tag(R.rod([0.9, altC[0] - 0.05, altC[1] + 0.05], [0.7, 0.2, -0.2], 0.04, grey(0x4a5560, "electrical"), E.altGrp), "electrical.alternator");
    E.anchors["electrical.alternator"] = anc(E.altGrp, [1.0, altC[0] + 0.2, altC[1]]);
    {
      // belt: hull of two circles in the (y,z) plane, extruded thin along x
      const r1 = 0.26, r2 = 0.11, dy = altC[0], dz = altC[1], d = Math.hypot(dy, dz), th0 = Math.atan2(dz, dy), ph = Math.acos((r1 - r2) / d);
      const arc = (cx, cy, r, a0, a1, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new T.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))); } return pts; };
      const build = (rr1, rr2) => arc(0, 0, rr1, th0 + ph, th0 + 2 * Math.PI - ph, 18).concat(arc(dy, dz, rr2, th0 - ph, th0 + ph, 10));
      // shape coords: u = y, v = z
      const outer = new T.Shape(build(r1, r2)), hole = new T.Path(build(r1 - 0.03, r2 - 0.03).reverse());
      outer.holes.push(hole);
      const eg = new T.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: false });
      const belt = new T.Mesh(eg, R.mat("electrical", 0x15191e, { rough: 0.9, dbl: true }));
      // map local (x=y, y=z, z=depth) → world (y, z, x)
      belt.rotation.set(0, 0, 0);
      const m = new T.Matrix4().set(0, 0, 1, 0.965, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
      belt.matrixAutoUpdate = false; belt.matrix.copy(m); belt.matrixWorldNeedsUpdate = true;
      R.tag(belt, "electrical.alternator");
      E.altGrp.add(belt);
    }

    /* --- starter --- */
    E.starter = grp(g);
    R.tag(R.mesh(new T.CylinderGeometry(0.15, 0.15, 0.42, 18), grey(0x4a4f57, "ignition"), E.starter, [0.8, -0.36, -0.5], [0, 0, Math.PI / 2]), "ignition.starter");
    R.tag(R.mesh(new T.CylinderGeometry(0.08, 0.08, 0.16, 12), grey(0x8a96a3, "ignition"), E.starter, [1.04, -0.36, -0.5], [0, 0, Math.PI / 2]), "ignition.starter");
    E.anchors["ignition.starter"] = anc(E.starter, [0.8, -0.2, -0.5]);

    /* --- rear: magnetos, oil filter, dipstick --- */
    E.magL = grp(g); E.magR = grp(g); E.filt = grp(g);
    for (const [grpn, z, id] of [[E.magL, -0.75, "ignition.magL"], [E.magR, 0.75, "ignition.magR"]]) {
      R.tag(R.mesh(new T.CylinderGeometry(0.19, 0.19, 0.34, 20), grey(0xc0586a, "ignition", { metal: 0.2 }), grpn, [-1.47, 0.15, z], [0, 0, Math.PI / 2]), id);
      R.tag(R.mesh(new T.CylinderGeometry(0.06, 0.06, 0.2, 10), grey(0x2a2f36, "ignition"), grpn, [-1.7, 0.15, z], [0, 0, Math.PI / 2]), id);
      E.anchors[id] = anc(grpn, [-1.5, 0.35, z]);
    }
    R.tag(R.mesh(new T.CylinderGeometry(0.15, 0.15, 0.32, 18), grey(0xb98a3d, "oil", { metal: 0.2 }), E.filt, [-1.46, -0.22, 0], [0, 0, Math.PI / 2]), "oil.filter");
    E.anchors["oil.filter"] = anc(E.filt, [-1.5, -0.05, 0]);
    {
      const dip = grp(g);
      R.tag(R.rod([-0.9, 0.38, 0], [-1.0, 0.95, 0], 0.025, grey(0xb98a3d, "oil"), dip), "oil.dipstick");
      R.tag(R.mesh(new T.SphereGeometry(0.06, 10, 8), grey(0xf6c90e, "oil"), dip, [-1.0, 0.97, 0]), "oil.dipstick");
      E.anchors["oil.dipstick"] = anc(dip, [-1.0, 1.0, 0]);
    }

    /* --- cylinders (barrel + head + cover + plugs + nozzle), pistons, rods --- */
    const mBar = grey(0x56606b, "engine", { clip: true, dbl: true });
    const mPlug = grey(0xc8d0d8, "ignition", { metal: 0.4 }), mInj = R.mat("fuel", 0x4dabf7, { metal: 0.3, rough: 0.4 });
    const barrelPts = [new T.Vector2(0.22, 0.45)];
    for (let i = 0; i < 7; i++) { const y = 0.5 + i * 0.07; barrelPts.push(new T.Vector2(0.22, y), new T.Vector2(0.34, y), new T.Vector2(0.34, y + 0.035), new T.Vector2(0.22, y + 0.035)); }
    barrelPts.push(new T.Vector2(0.22, 1.0));
    const headPts = [new T.Vector2(0.3, 1.0), new T.Vector2(0.4, 1.02)];
    for (let i = 0; i < 4; i++) { const y = 1.04 + i * 0.07; headPts.push(new T.Vector2(0.42, y), new T.Vector2(0.42, y + 0.04), new T.Vector2(0.34, y + 0.04)); }
    headPts.push(new T.Vector2(0.34, 1.3), new T.Vector2(0.2, 1.38), new T.Vector2(0.001, 1.4));
    const gBar = new T.LatheGeometry(barrelPts, 22), gHead = new T.LatheGeometry(headPts, 22);
    const gPist = new T.CylinderGeometry(0.19, 0.19, 0.26, 20), gCrown = new T.CylinderGeometry(0.19, 0.19, 0.03, 20);
    const gRod = new T.CylinderGeometry(0.035, 0.035, 1, 8);
    const mPist = grey(0xc9d1d9, "engine", { metal: 0.5, rough: 0.3 }), mRod = grey(0x9aa5b1, "engine", { metal: 0.5 });
    for (let k = 0; k < 4; k++) {
      const sd = CYL_SIDE[k], cg = grp(g, [CYL_X[k], 0, 0]);
      const ax = grp(cg);
      ax.rotation.x = sd > 0 ? Math.PI / 2 : -Math.PI / 2;
      const tint = R.mat("engine", 0x9aa7b4, { uniq: true, clip: true, dbl: true, metal: 0.3, rough: 0.5 });
      R.tag(R.mesh(gBar, mBar, ax), "engine.cylinder");
      R.tag(R.mesh(gHead, tint, ax), "engine.cylinder");
      R.tag(R.mesh(new T.BoxGeometry(0.62, 0.16, 0.3), tint, ax, [0, 1.36, 0]), "engine.cylinder");
      // plugs: one upper, one lower per cylinder
      for (const py of [0.3, -0.3]) {
        const pl = R.mesh(new T.CylinderGeometry(0.04, 0.04, 0.2, 8), mPlug, cg, [py > 0 ? 0.17 : -0.17, py, sd * 1.12], [0, 0, py > 0 ? -0.5 : 0.5]);
        R.tag(pl, "ignition.plugs");
        if (py > 0 && k === 0) E.anchors["ignition.plugs"] = anc(cg, [0.17, 0.45, sd * 1.12]);
      }
      // injector nozzle at the intake port
      R.tag(R.mesh(new T.CylinderGeometry(0.035, 0.035, 0.16, 8), mInj, cg, [0, -0.3, sd * 1.0], [0, 0, 0]), "fuel.nozzles");
      if (k === 1) E.anchors["fuel.nozzles"] = anc(cg, [0, -0.3, sd * 1.0]);
      if (k === 0) { E.anchors["engine.cylinder"] = anc(cg, [0, 0.3, sd * 1.4]); }
      // piston + rod
      const pg = grp(g, [CYL_X[k], 0, 0]);
      const pistonBody = R.mesh(gPist, mPist, pg, [0, 0, 0], [Math.PI / 2, 0, 0], "engine.piston");
      const crownMat = R.mat("engine", 0x9aa7b4, { uniq: true, rough: 0.5 });
      const crown = R.mesh(gCrown, crownMat, pg, [0, 0, sd * 0.14], [Math.PI / 2, 0, 0], "engine.piston");
      const rod = R.mesh(gRod, mRod, g, null, null, "engine.piston");
      if (k === 0) E.anchors["engine.piston"] = anc(pg, [0, 0.0, 0]);
      E.cyl.push({ k, side: sd, cg, ax, pg, rod, tint, crownMat, plug: null });
    }
    E.strokeLabelAnchors = E.cyl.map((c) => anc(c.cg, [0, 0.4, c.side * 1.55]));

    /* --- fuel: servo, flow divider, injector lines --- */
    E.fuel = grp(g);
    E.divider = grp(g);
    R.tag(R.mesh(new T.CylinderGeometry(0.1, 0.1, 0.16, 16), mInj, E.divider, [0, 0.6, 0]), "fuel.divider");
    E.anchors["fuel.divider"] = anc(E.divider, [0, 0.75, 0]);
    const mLine = R.mat("fuel", 0x4dabf7, { rough: 0.4, metal: 0.2 });
    E.lines = [];
    for (let k = 0; k < 4; k++) { const m = R.tube([[0, 0.6, 0], [0, 0.7, 0.2], [0.3, 0.3, 1]], 0.03, mLine, g, "fuel.nozzles", 10); E.lines.push(m); E.dyn.push(m); }
    E.feed = R.tube([[-0.3, -0.9, 0], [-1.0, -0.7, 0.05], [-1.05, 0.3, 0.05], [-0.4, 0.62, 0], [0, 0.62, 0]], 0.03, mLine, g, "fuel.divider", 24);
    E.feedOff = E.feed;

    /* --- induction: filter, servo, pipes, runners --- */
    E.intake = grp(g);
    const mIn = grey(0x6f7c89, "engine", { metal: 0.4 });
    R.tag(R.mesh(new T.BoxGeometry(0.5, 0.34, 0.6), grey(0x3c4a5a, "engine", { metal: 0.1, rough: 0.9 }), E.intake, [0.9, -1.0, 0]), "engine.airFilter");
    E.anchors["engine.airFilter"] = anc(E.intake, [0.9, -0.7, 0.3]);
    R.tag(R.mesh(new T.BoxGeometry(0.3, 0.24, 0.3), grey(0x4dabf7, "engine", { metal: 0.3 }), E.intake, [-0.3, -0.95, 0]), "engine.servo");
    E.anchors["engine.servo"] = anc(E.intake, [-0.3, -0.72, 0.15]);
    R.tag(R.rod([0.66, -0.95, 0], [-0.15, -0.95, 0], 0.1, mIn, E.intake), "engine.manifold");
    R.tag(R.rod([-0.3, -0.95, -0.62], [-0.3, -0.95, 0.62], 0.08, mIn, E.intake), "engine.manifold");
    for (const sd of [1, -1]) {
      R.tag(R.rod([-0.3, -0.95, sd * 0.62], [-0.3, -0.45, sd * 0.62], 0.07, mIn, E.intake), "engine.manifold");
      R.tag(R.rod([-0.95, -0.45, sd * 0.62], [0.95, -0.45, sd * 0.62], 0.06, mIn, E.intake), "engine.manifold");
    }
    E.anchors["engine.manifold"] = anc(E.intake, [0.4, -0.45, 0.62]);
    E.branches = [];
    for (let k = 0; k < 4; k++) { const m = R.tube([[0, 0, 0], [0, 0.1, 0.1]], 0.05, mIn, g, "engine.manifold", 6); E.branches.push(m); E.dyn.push(m); }

    /* --- exhaust: per-bank pipes + muffler --- */
    const mEx = grey(0x7a6a5e, "engine", { metal: 0.5, rough: 0.5 });
    E.exh = [grp(g), grp(g)];            // [+Z, -Z]
    [1, -1].forEach((sd, i) => {
      for (let k = 0; k < 4; k++) if (CYL_SIDE[k] === sd) R.tag(R.rod([CYL_X[k], -0.28, sd * 1.08], [CYL_X[k], -0.45, sd * 1.14], 0.06, mEx, E.exh[i]), "engine.exhaust");
      R.tag(R.tube([[1.0, -0.45, sd * 1.14], [-0.7, -0.47, sd * 1.14], [-1.15, -0.6, sd * 0.8], [-1.2, -0.85, sd * 0.3]], 0.07, mEx, E.exh[i], null, 20), "engine.exhaust");
    });
    E.anchors["engine.exhaust"] = anc(E.exh[0], [0.2, -0.55, 1.14]);
    E.muff = grp(g);
    R.tag(R.mesh(new T.CylinderGeometry(0.17, 0.17, 0.55, 20), mEx, E.muff, [-1.25, -0.92, 0], [0, 0, Math.PI / 2]), "engine.muffler");
    R.tag(R.rod([-1.5, -0.92, 0], [-1.8, -0.95, 0], 0.07, mEx, E.muff), "engine.muffler");
    E.anchors["engine.muffler"] = anc(E.muff, [-1.25, -0.72, 0]);

    // wire hotspot anchors for all ids that share a parent group
    E.set = (explode, phi, cut) => E.update(explode, phi, cut);

    // kinematics + explode in one pass
    E.update = (e, phi) => {
      const ph = phi * D2R;
      E.crank.rotation.x = ph;
      E.caseL.position.z = -0.25 - e * 0.35; E.caseR.position.z = 0.25 + e * 0.35;
      E.sump.position.y = -0.55 - e * 0.85;
      E.acc.position.x = -1.15 - e * 0.5;
      E.magL.position.set(-e * 1.1, 0, -e * 0.15); E.magR.position.set(-e * 1.1, 0, e * 0.15);
      E.filt.position.set(-e * 1.1, 0, 0);
      E.pulleyGrp.position.x = e * 0.5; E.altGrp.position.x = e * 0.5;
      E.frontGrp.position.x = e * 1.5;
      E.starter.position.set(0, -e * 0.7, -e * 0.35);
      E.intake.position.y = -e * 0.55;
      E.exh[0].position.set(0, -e * 0.1, e * 1.25); E.exh[1].position.set(0, -e * 0.1, -e * 1.25);
      E.muff.position.set(-e * 0.8, -e * 0.5, 0);
      E.divider.position.y = e * 0.7;
      for (const c of E.cyl) {
        const k = c.k, sd = c.side;
        c.cg.position.z = sd * e * 1.25;
        const b = beta0[k] + ph, py = CR * Math.cos(b), pz = CR * Math.sin(b);
        const s = pz * sd + Math.sqrt(CL * CL - py * py);
        const pinZ = sd * (s + e * 0.6);
        c.pg.position.z = pinZ + sd * 0.08;
        // rod from crank pin to piston pin
        const a = new T.Vector3(CYL_X[k], py, pz), bb = new T.Vector3(CYL_X[k], 0, pinZ), d = bb.clone().sub(a);
        c.rod.position.copy(a).addScaledVector(d, 0.5);
        c.rod.scale.set(1, d.length(), 1);
        c.rod.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
        // stroke tint
        const psi = (((phi + CYC[k]) % 720) + 720) % 720, si = Math.floor(psi / 180) % 4;
        if (E.strokeIdx[k] !== si) {
          E.strokeIdx[k] = si;
          const col = STROKES[si].c;
          c.tint.color.setHex(col); c.tint.emissive.setHex(col); c.tint.emissiveIntensity = 0.28;
          c.crownMat.color.setHex(col); c.crownMat.emissive.setHex(col); c.crownMat.emissiveIntensity = 0.35;
          E.onStroke && E.onStroke(k, si);
        }
      }
      // dynamic lines between moving parts
      const dv = [0, 0.6 + e * 0.7, 0];
      E.cyl.forEach((c, k) => {
        const x = CYL_X[k], sd = c.side, z = sd * e * 1.25;
        const noz = [x, -0.3, sd * 1.0 + z];
        const line = [[0, dv[1], 0], [x * 0.5, dv[1] + 0.1, sd * 0.5], [x + 0.45, 0.25, sd * 0.95 + z], [x + 0.45, -0.3, sd * 1.0 + z], noz];
        E.lines[k].geometry.dispose();
        E.lines[k].geometry = new T.TubeGeometry(new T.CatmullRomCurve3(line.map((p) => new T.Vector3(...p))), 24, 0.028, 6, false);
        const run = [x, -0.45 - e * 0.55, sd * 0.62];
        E.branches[k].geometry.dispose();
        E.branches[k].geometry = new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(...run), new T.Vector3(x, -0.4 - e * 0.2, sd * 0.85 + z * 0.4), new T.Vector3(...noz)]), 10, 0.045, 6, false);
      });
      E.feed.position.y = 0;
    };
    E.update(0, 0);
    return E;
  }

  /* =============================== AIRPLANE =============================== */
  function buildAirplane(T, R, AF) {
    const { FUSE, WING, GROUND, ENG, SYSCOL, FIN, RUDDER } = AF;
    const root = new T.Group(), A = { root, routes: {}, anchors: {} };
    const skin = R.mat("skin", 0xe8edf2, { skin: true, rough: 0.5, dbl: true });
    const skinCtl = R.mat("controls", 0xd5dde6, { skin: true, rough: 0.5, dbl: true });
    const trim = R.mat("skin", 0x34ace0, { skin: true, rough: 0.5, dbl: true });
    const glass = R.mat("skin", 0x15202c, { skin: true, rough: 0.15, metal: 0.4, dbl: true, op: 0.94 });
    const dark = R.mat("gear", 0x2b333c, { skin: true, rough: 0.6 });
    const tire = R.mat("gear", 0x14181d, { skin: true, rough: 0.9 });
    const steel = R.mat("gear", 0x8895a3, { skin: true, metal: 0.4, rough: 0.4 });

    /* --- fuselage + cowl --- */
    const fuseRing = (x, th0, th1, nR, off, closed) => {
      const w = Math.max(0.02, interp(FUSE, x, 1)), top = interp(FUSE, x, 2), bot = interp(FUSE, x, 3), ring = [];
      for (let j = 0; j < nR; j++) { const th = th0 + (th1 - th0) * j / (closed ? nR : nR - 1), [z, y] = ringPt(w, top, bot, th, 2.6); ring.push([x, y * off, z * off]); }
      return ring;
    };
    const fuseGeo = (xa, xb, nx, th0, th1, nR, off, closed) => {
      const rings = []; for (let i = 0; i <= nx; i++) rings.push(fuseRing(xa + (xb - xa) * i / nx, th0, th1, nR, off, closed));
      return loft(T, rings, closed, false);
    };
    R.mesh(fuseGeo(-13.6, 6.1, 90, 0, 2 * Math.PI, 44, 1, true), skin, root);
    for (const sg of [1, -1]) {
      const t0 = sg > 0 ? 96 * D2R : -104 * D2R, t1 = sg > 0 ? 104 * D2R : -96 * D2R;
      R.mesh(fuseGeo(-11, 3.3, 40, t0, t1, 4, 1.006, false), trim, root);
      // side windows (door + rear quarter) and windshield / rear window
      const w0 = sg > 0 ? 30 * D2R : -80 * D2R, w1 = sg > 0 ? 80 * D2R : -30 * D2R;
      R.mesh(fuseGeo(0.2, 2.35, 12, w0, w1, 8, 1.012, false), glass, root);
      R.mesh(fuseGeo(-2.45, -0.15, 12, w0, w1, 8, 1.012, false), glass, root);
    }
    R.mesh(fuseGeo(1.7, 3.0, 12, -50 * D2R, 50 * D2R, 14, 1.012, false), glass, root);
    R.mesh(fuseGeo(-3.5, -2.6, 8, -35 * D2R, 35 * D2R, 10, 1.012, false), glass, root);
    // cowl air inlets
    for (const sg of [1, -1]) R.mesh(new T.SphereGeometry(0.3, 14, 10), dark, root, [5.85, -0.5, sg * 0.55]).scale.set(0.3, 0.55, 0.55);

    /* --- wings --- */
    const wsec = (z) => {
      const a = Math.abs(z), le = WING.le - Math.max(0, a - 7) * 0.05;
      const ch = a <= 7 ? 5.3 : a <= 17.2 ? 5.3 - (a - 7) * (1.4 / 10.2) : Math.max(0.5, 3.9 - (a - 17.2) * 3.6);
      return { le, ch, y: WING.y + a * WING.dih, t: a < 12 ? 1 : 0.9 };
    };
    const wingRing = (z, sg, f0, f1, ts) => {
      const s = wsec(z), pts = airfoil(f0, f1, 14, true);
      return pts.map(([f, y]) => [s.le - f * s.ch, s.y + y * s.ch * ts * s.t, sg * z]);
    };
    const wingPiece = (z0, z1, sg, f0, f1, ts, mat, id, parent) => {
      const zs = [z0, (z0 + z1) / 2, z1], rings = zs.map((z) => wingRing(z, sg, f0, f1, ts));
      const m = new T.Mesh(loft(T, rings, true, true), mat);
      (parent || root).add(m); if (id) R.tag(m, id); return m;
    };
    for (const sg of [1, -1]) {
      const zs = [0.9, 3, 7, 11, 15, 17.2, 17.7, 17.95], rings = zs.map((z) => wingRing(z, sg, 0, 1, 1));
      R.mesh(loft(T, rings, true, true), skin, root);
      wingPiece(1.6, 7.4, sg, 0.72, 1, 1.05, skinCtl, "controls.flaps");
      wingPiece(7.8, 16.9, sg, 0.72, 1, 1.05, skinCtl, "controls.ailerons");
      R.rod([0.9, -1.35, sg * 1.35], [0.9, 2.72, sg * 7.0], 0.085, R.mat("skin", 0x8895a3, { skin: true, metal: 0.4, rough: 0.4 }), root);
    }

    /* --- tail --- */
    const tsec = (z) => { const a = Math.abs(z), le = -10.6 - (a - 0.5) * (0.8 / 5.1), te = -13.6; return { le, ch: le - te, ye: 0.2 }; };
    const tailRing = (z, sg, f0, f1, ts) => { const s = tsec(z), pts = airfoil(f0, f1, 10, false); return pts.map(([f, y]) => [s.le - f * s.ch, s.ye + y * s.ch * ts, sg * z]); };
    for (const sg of [1, -1]) {
      const zs = [0.4, 3, 5.6];
      R.mesh(loft(T, zs.map((z) => tailRing(z, sg, 0, 0.6, 1)), true, true), skin, root);
      const el = new T.Mesh(loft(T, [0.6, 3.1, 5.55].map((z) => tailRing(z, sg, 0.58, 1, 1.06)), true, true), skinCtl);
      root.add(el); R.tag(el, "controls.elevator");
    }
    R.mesh(new T.BoxGeometry(0.32, 0.035, 0.85), skinCtl, root, [-13.78, 0.2, 2.6], null, "controls.trimTab");
    const polyShape = (pts) => new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)));
    const fin = new T.Mesh(new T.ExtrudeGeometry(polyShape(FIN), { depth: 0.22, bevelEnabled: false }), skin);
    fin.position.z = -0.11; root.add(fin);
    const rud = new T.Mesh(new T.ExtrudeGeometry(polyShape(RUDDER), { depth: 0.2, bevelEnabled: false }), skinCtl);
    rud.position.z = -0.1; root.add(rud); R.tag(rud, "controls.rudder");

    /* --- landing gear --- */
    const wheel = (x, y, z, r, w, pant, id) => {
      const wm = R.mesh(new T.CylinderGeometry(r, r, w, 24), tire, root, [x, y, z], [Math.PI / 2, 0, 0], id);
      R.mesh(new T.CylinderGeometry(r * 0.55, r * 0.55, w * 1.02, 16), steel, root, [x, y, z], [Math.PI / 2, 0, 0], id);
      if (pant) { const p = R.mesh(new T.SphereGeometry(1, 20, 14), skin, root, [x, y + 0.02, z]); p.scale.set(pant[0], pant[1], pant[2]); }
      return wm;
    };
    R.rod([3.2, -1.2, 0], [3.0, -3.0, 0], 0.1, steel, root, "gear.noseStrut");
    R.rod([3.15, -2.3, 0], [3.05, -3.0, 0], 0.065, R.mat("gear", 0xc8d0d8, { skin: true, metal: 0.5 }), root, "gear.noseStrut");
    R.mesh(new T.BoxGeometry(0.1, 0.35, 0.12), R.mat("gear", 0xf6c90e, { skin: true }), root, [3.12, -2.55, 0.14], null, "gear.damper");
    wheel(3.0, -3.05, 0, 0.55, 0.32, [0.78, 0.66, 0.26], "gear.noseStrut");
    for (const sg of [1, -1]) {
      R.rod([0.7, -1.4, sg * 1.1], [0.25, -2.85, sg * 3.3], 0.13, steel, root, "gear.mains", 8);
      wheel(0.2, -2.9, sg * 3.45, 0.7, 0.36, [1.5, 0.9, 0.46], "gear.mains");
      R.mesh(new T.CylinderGeometry(0.34, 0.34, 0.05, 20), R.mat("gear", 0xb94a4a, { skin: true }), root, [0.2, -2.9, sg * 3.25], [Math.PI / 2, 0, 0], "gear.brakes");
    }

    /* --- static port, pitot, stall inlet, vent, drains, caps --- */
    R.mesh(new T.CylinderGeometry(0.11, 0.11, 0.04, 14), R.mat("pitot", 0x2ed5d5, { skin: true }), root, [3.3, -0.2, -1.69], [Math.PI / 2, 0, 0], "pitot.staticPort");
    const mPit = R.mat("pitot", 0xcfe9ee, { metal: 0.5, rough: 0.3, skin: true });
    R.rod([2.55, 2.6, -8.6], [3.55, 2.5, -8.6], 0.04, mPit, root, "pitot.pitotTube");
    R.rod([2.7, 2.7, -8.6], [2.7, 2.45, -8.6], 0.035, mPit, root, "pitot.pitotTube");
    R.mesh(new T.BoxGeometry(0.06, 0.12, 0.3), R.mat("environ", 0xff7f50, { skin: true }), root, [2.76, 2.92, -6.4], null, "environ.inlet");
    R.rod([0.5, 2.62, -6.9], [0.5, 2.25, -6.9], 0.03, R.mat("fuel", 0x4dabf7, { skin: true }), root, "fuel.vent");
    R.mesh(new T.SphereGeometry(0.08, 10, 8), R.mat("fuel", 0x4dabf7, { skin: true }), root, [2.0, 2.58, -2.4], null, "fuel.drains");
    for (const sg of [1, -1]) R.mesh(new T.CylinderGeometry(0.18, 0.18, 0.05, 16), R.mat("fuel", 0x4dabf7, { skin: true }), root, [1.6, 3.36, sg * 5], null, sg > 0 ? "fuel.tankR" : "fuel.tankL");

    /* --- propeller + spinner (airplane-sized) --- */
    const prop = new T.Group(); prop.position.x = 6.12; root.add(prop); A.prop = prop;
    const mB = R.mat("prop", 0x1b2128, { rough: 0.4 }), mTip = R.mat("prop", 0xf6c90e);
    for (const sg of [1, -1]) {
      const b = new T.Group(); b.rotation.x = sg > 0 ? 0 : Math.PI; prop.add(b);
      const bl = new T.Group(); bl.rotation.y = 0.3; b.add(bl);
      R.mesh(new T.BoxGeometry(0.06, 3.1, 0.36), mB, bl, [0, 1.75, 0], null, "prop.blade");
      R.mesh(new T.BoxGeometry(0.065, 0.3, 0.36), mTip, bl, [0, 3.1, 0], null, "prop.blade");
    }
    const spin = R.mesh(new T.LatheGeometry([new T.Vector2(0.55, 0), new T.Vector2(0.52, 0.22), new T.Vector2(0.42, 0.42), new T.Vector2(0.26, 0.62), new T.Vector2(0.1, 0.76), new T.Vector2(0.001, 0.8)], 28),
      R.mat("prop", 0x34ace0, { skin: false, rough: 0.35 }), prop, [-0.07, 0, 0], [0, 0, -Math.PI / 2], "prop.spinner");

    /* --- interior (only seen in x-ray / focus) --- */
    const inter = new T.Group(); root.add(inter); A.interior = inter;
    const mI = R.mat("interior", 0x1c232c, { rough: 0.7 });
    R.mesh(new T.BoxGeometry(0.12, 1.15, 3.0), mI, inter, [2.62, 0.85, 0]);
    R.mesh(new T.BoxGeometry(0.6, 0.1, 3.2), mI, inter, [2.4, 1.5, 0]);
    const scr = R.mat("interior", 0x13283a, { em: 0x1d5f8a });
    R.mesh(new T.BoxGeometry(0.03, 0.55, 0.8), scr, inter, [2.7, 1.0, -0.75]);
    R.mesh(new T.BoxGeometry(0.03, 0.55, 0.8), scr, inter, [2.7, 1.0, 0.75]);
    R.mesh(new T.BoxGeometry(0.03, 0.3, 0.4), scr, inter, [2.7, 1.05, 0]);
    for (const sg of [1, -1]) {
      R.mesh(new T.BoxGeometry(0.9, 0.25, 1.0), mI, inter, [0.7, -0.75, sg * 0.8]);
      R.mesh(new T.BoxGeometry(0.15, 1.1, 0.95), mI, inter, [0.2, -0.2, sg * 0.8]);
      R.rod([2.4, -0.3, sg * 0.8], [1.7, -0.15, sg * 0.8], 0.04, mI, inter);
    }
    R.mesh(new T.CylinderGeometry(0.16, 0.16, 0.1, 16), R.mat("fuel", 0x4dabf7, { rough: 0.4 }), inter, [0.6, -1.2, 0], null, "fuel.selector");

    /* --- tanks (in the wings) --- */
    const tanks = new T.Group(); root.add(tanks); A.tanks = tanks;
    for (const sg of [1, -1]) {
      const id = sg > 0 ? "fuel.tankR" : "fuel.tankL";
      R.mesh(new T.BoxGeometry(2.0, 0.5, 4.5), R.mat("fuel", 0x2f7fd0, { op: 0.8, rough: 0.4 }), tanks, [1.5, 2.95, sg * 4.15], null, id);
      R.mesh(new T.BoxGeometry(1.8, 0.28, 4.3), R.mat("fuel", 0x4dabf7, { op: 0.9, em: 0x1a4a80 }), tanks, [1.5, 2.86, sg * 4.15], null, id);
    }

    /* --- engine instance inside the cowl --- */
    A.eng = buildEngine(T, R, { prop: false });
    A.eng.group.scale.setScalar(ENG.s); A.eng.group.position.set(ENG.x, 0, 0);
    // battery (generic, forward) + heat shroud
    const bat = R.mesh(new T.BoxGeometry(0.4, 0.28, 0.34), R.mat("electrical", 0xd98a1f, { rough: 0.5 }), root, [3.8, -0.75, 1.1], null, "electrical.battery");
    R.mesh(new T.CylinderGeometry(0.15, 0.15, 0.7, 16), R.mat("environ", 0xff7f50, { metal: 0.3, rough: 0.5 }), root, [4.7, -0.35, 0.8], [0, 0, Math.PI / 2], "environ.shroud");
    A.eng.group.parent === null && root.add(A.eng.group);
    A.inner = new T.Group(); A.inner.add(A.eng.group); A.inner.add(bat);
    root.add(A.inner);
    // shroud was added to root above; collect it with the engine bay
    root.children.forEach((c) => { if (c.isMesh && c.userData.id === "environ.shroud") { root.remove(c); A.inner.add(c); } });

    /* --- ground --- */
    const gm = R.mat("ground", 0x141b23, { rough: 1 });
    R.mesh(new T.CircleGeometry(25, 72), gm, root, [0, GROUND - 0.03, 0], [-Math.PI / 2, 0, 0]);
    R.mesh(new T.RingGeometry(24.4, 24.7, 72), R.mat("ground", 0x2d3947, { rough: 1 }), root, [0, GROUND - 0.02, 0], [-Math.PI / 2, 0, 0]);
    for (let i = -4; i <= 4; i++) R.mesh(new T.BoxGeometry(2.2, 0.01, 0.22), R.mat("ground", 0x2d3947, { rough: 1 }), root, [i * 4.4, GROUND - 0.015, 0]);

    /* --- routes (shown when a system is focused): [pts, colour, beads] --- */
    const eP = (lx, ly, lz) => [ENG.x + ENG.s * lx, ENG.s * ly, ENG.s * lz];
    const dv = eP(0, 0.6, 0);
    A.routeDefs = {
      fuel: [
        { c: SYSCOL.fuel, p: [[1.0, 2.9, -1.9], [0.8, 2.0, -1.55], [0.7, 0.0, -1.4], [0.6, -1.0, -0.5], [0.6, -1.15, 0]] },
        { c: SYSCOL.fuel, p: [[1.0, 2.9, 1.9], [0.8, 2.0, 1.55], [0.7, 0.0, 1.4], [0.6, -1.0, 0.5], [0.6, -1.15, 0]] },
        { c: SYSCOL.fuel, p: [[0.6, -1.15, 0], [2.0, -1.22, 0], [3.9, -1.0, 0], [4.4, -0.8, 0.1], eP(-0.3, -0.9, 0), eP(-1.0, -0.7, 0.05), eP(-1.05, 0.3, 0.05), dv] },
        ...[0, 1, 2, 3].map((k) => ({ c: SYSCOL.fuel, p: [dv, eP(CYL_X[k] * 0.5, 0.7, CYL_SIDE[k] * 0.5), eP(CYL_X[k] + 0.2, 0.2, CYL_SIDE[k] * 1.0), eP(CYL_X[k], -0.3, CYL_SIDE[k] * 1.0)] })),
      ],
      pitot: [
        { c: SYSCOL.pitot, p: [[3.5, 2.52, -8.6], [2.2, 2.5, -4], [1.9, 2.4, -1.7], [2.3, 1.6, -1.5], [2.6, 1.0, -0.85], [2.7, 1.0, -0.75]] },
        { c: "#b8c7d6", p: [[3.3, -0.2, -1.66], [3.0, -0.1, -1.3], [2.7, 0.4, -0.9], [2.7, 0.95, -0.2], [2.7, 1.05, 0]] },
      ],
      electrical: [
        { c: SYSCOL.electrical, p: [eP(1.0, 0.6, -0.62), [5.0, 1.0, -0.6], [4.0, 0.2, -0.2], [3.8, -0.75, 1.1]] },
        { c: SYSCOL.electrical, p: [[3.8, -0.75, 1.1], [3.4, -0.7, 0.2], [3.0, 0.0, -0.9], [2.72, 0.7, -1.25]] },
        { c: SYSCOL.electrical, p: [[2.72, 0.7, -1.25], [2.72, 0.15, -0.75], [2.72, 1.0, -0.75]] },
      ],
      ignition: [
        { c: SYSCOL.ignition, p: [[2.72, 0.2, -1.25], [3.3, 0.4, -0.9], eP(-1.3, 0.15, -0.75)], still: true },
        { c: SYSCOL.ignition, p: [[2.72, 0.2, -1.25], [3.3, 0.5, 0.0], [3.6, 0.3, 0.4], eP(-1.3, 0.15, 0.75)], still: true },
      ],
    };
    A.routeGroups = {};
    for (const [sys, list] of Object.entries(A.routeDefs)) {
      const g = new T.Group(); g.visible = false; root.add(g); A.routeGroups[sys] = g;
      list.forEach((r) => {
        r.curve = new T.CatmullRomCurve3(r.p.map((p) => new T.Vector3(...p)));
        const m = new T.Mesh(new T.TubeGeometry(r.curve, 40, 0.035, 6, false), new T.MeshBasicMaterial({ color: r.c, transparent: true, opacity: 0.85 }));
        g.add(m);
      });
    }
    return A;
  }

  /* ================================= VIEW ================================= */
  async function mount(el, o = {}) {
    const ok = await load();
    if (!ok || !el) return null;
    const T = window.THREE;
    const rdr = getRenderer(T);
    if (!rdr) return null;
    const scene = o.scene === "engine" ? "engine" : "airplane";
    const AF = AFR();
    if (scene === "airplane" && (!AF || !(SysDiagrams.hotspots || []).length)) return null;

    /* ---- DOM ---- */
    const wrap = document.createElement("div");
    wrap.className = "s3-wrap s3-" + scene;
    wrap.style.cssText = "position:relative;width:100%;overflow:hidden;";
    const canvas = document.createElement("canvas");
    canvas.className = "s3-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", scene === "engine" ? "3D engine model. Drag to rotate, scroll or pinch to zoom." : "3D airplane model. Drag to rotate, scroll or pinch to zoom.");
    canvas.style.cssText = "display:block;position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:grab;";
    const labelBox = document.createElement("div");
    labelBox.className = "s3-labels";
    labelBox.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    const hint = document.createElement("div");
    hint.className = "s3-hint";
    hint.textContent = "drag to rotate · tap a part";
    hint.style.cssText = "position:absolute;left:8px;bottom:6px;pointer-events:none;";
    wrap.append(canvas, labelBox, hint);
    el.appendChild(wrap);
    const ctx2 = canvas.getContext("2d");

    /* ---- scene ---- */
    const ghostOp = scene === "engine" ? 0.14 : 0.08;
    const R = kit(T, ghostOp);
    const sc = new T.Scene();
    sc.background = new T.Color(0x10161d);
    sc.add(new T.HemisphereLight(0xdbeaff, 0x1a2230, scene === "engine" ? 0.6 : 0.95));
    const sun = new T.DirectionalLight(0xffffff, scene === "engine" ? 0.6 : 0.85); sun.position.set(10, 22, 12); sc.add(sun);
    const fill = new T.DirectionalLight(0x6fa8ff, 0.3); fill.position.set(-12, 6, -10); sc.add(fill);
    const cam = new T.PerspectiveCamera(34, 1, 0.5, 400);

    let A = null, E = null;
    if (scene === "airplane") { A = buildAirplane(T, R, AF); sc.add(A.root); E = A.eng; }
    else { E = buildEngine(T, R, {}); sc.add(E.group); }

    /* ---- hotspots ---- */
    const defs = scene === "engine" ? ENGINE_HOT : SysDiagrams.hotspots;
    const ent = defs.map((d) => {
      const e = { def: d, el: null, pos: new T.Vector3(), mark: "", on: true, sy: d.sys };
      if (scene === "airplane") {
        e.static = new T.Vector3(d.p[0], d.p[1], d.p[2]);
        // hotspots anchored on parts that live in the engine bay follow nothing (static) — same table the 2D view uses
      } else e.anchor = E.anchors[d.id] || null;
      const l = document.createElement("div");
      l.className = "s3-label";
      l.dataset.id = d.id; l.dataset.sys = d.sys;
      l.textContent = d.label;
      l.style.cssText = "position:absolute;left:0;top:0;white-space:nowrap;display:none;pointer-events:none;";
      labelBox.appendChild(l);
      e.el = l;
      return e;
    });
    const byId = {}; ent.forEach((e) => { byId[e.def.id] = e; });
    const strokeEls = [];
    if (scene === "engine") {
      for (let k = 0; k < 4; k++) {
        const l = document.createElement("div");
        l.className = "s3-label s3-stroke";
        l.style.cssText = "position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;";
        labelBox.appendChild(l); strokeEls.push(l);
      }
      E.onStroke = (k, si) => { strokeEls[k].textContent = STROKES[si].n; strokeEls[k].dataset.stroke = STROKES[si].n.toLowerCase(); strokeEls[k].style.borderColor = "#" + STROKES[si].c.toString(16).padStart(6, "0"); };
      E.strokeIdx = [-1, -1, -1, -1];
    }

    // dots (hotspot markers) + rings (selection / marks) + beads (flow)
    const dotTex = (kind) => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"); x.beginPath(); x.arc(32, 32, 26, 0, 7);
      if (kind === "dot") { x.fillStyle = "#fff"; x.fill(); x.lineWidth = 6; x.strokeStyle = "rgba(8,12,18,.95)"; x.stroke(); }
      else { x.lineWidth = 6; x.strokeStyle = "#fff"; x.stroke(); }
      return new T.CanvasTexture(c);
    };
    const N = ent.length, texDot = dotTex("dot"), texRing = dotTex("ring");
    const mkPoints = (n, tex, size) => {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("color", new T.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new T.PointsMaterial({ size, map: tex, vertexColors: true, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, alphaTest: 0.05 });
      const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = 20; sc.add(p); return p;
    };
    const dots = mkPoints(N, texDot, 12), rings = mkPoints(N, texRing, 22), beads = mkPoints(80, texDot, 6);

    /* ---- state ---- */
    let focus = o.focus || null, selected = o.select || null, labelsOn = o.labels !== false, xray = false;
    let explode = 0, cut = false, crank = 0, playing = false;
    let destroyed = false, visible = true, dirty = true, raf = 0, lastT = 0, fading = false, w = 0, h = 0, dpr = 1, lastTick = 0;
    const marks = {};
    let routeSys = null, beadList = [];

    const CAM = scene === "engine"
      ? { az: -150, el: 38, dist: 8.5, min: 3.5, max: 18, tgt: [0.2, -0.1, 0], elMin: -80, elMax: 86 }
      : { az: -50, el: 18, dist: 37, min: 9, max: 70, tgt: [0.5, 0.2, 0], elMin: 2, elMax: 86 };
    const cs = { az: CAM.az, el: CAM.el, dist: CAM.dist };
    const tgt = new T.Vector3(...CAM.tgt);

    const INTERIOR_FOCUS = ["fuel", "electrical", "pitot", "ignition", "oil", "engine", "environ"];
    function applyFocus() {
      for (const m of R.mats) {
        let f;
        if (focus) f = m.sys === focus ? 1 : (scene === "engine" || !m.skin ? ghostOp + 0.04 : ghostOp);
        else f = xray && m.skin ? 0.14 : 1;
        if (scene === "airplane" && focus && m.sys === "ground") f = 1;
        if (scene === "airplane" && m.sys === "ground") f = 1;
        m.tgt = f;
      }
      if (A) {
        const inner = xray || (focus && INTERIOR_FOCUS.includes(focus));
        A.inner.visible = inner; A.interior.visible = inner; A.tanks.visible = inner;
        for (const [s, g] of Object.entries(A.routeGroups)) g.visible = focus === s;
      }
      routeSys = A && focus && A.routeDefs[focus] ? focus : null;
      beadList = [];
      if (routeSys) A.routeDefs[routeSys].forEach((r) => { if (!r.still) for (let i = 0; i < 8; i++) beadList.push({ r, t0: i / 8 }); });
      beadList = beadList.slice(0, 80);
      fading = true; dirty = true; need();
    }
    function stepFade() {
      let more = false;
      for (const m of R.mats) {
        if (Math.abs(m.cur - m.tgt) > 0.004) { m.cur += (m.tgt - m.cur) * 0.3; more = true; } else m.cur = m.tgt;
        const op = m.base * m.cur;
        m.m.opacity = op; m.m.transparent = op < 0.999; m.m.depthWrite = m.cur > 0.5;
      }
      fading = more; if (more) dirty = true;
    }
    function applyCut() {
      for (const m of R.mats) if (m.clip) { m.m.clippingPlanes = cut ? [R.plane] : null; m.m.side = cut ? T.DoubleSide : (m.m.side); m.m.needsUpdate = true; }
      dirty = true; need();
    }

    // active set for dots / picking
    const isActive = (e) => !focus || e.def.sys === focus || e.def.id === selected;
    function colorOf(e) {
      const mk = marks[e.def.id];
      const hex = mk === "ok" || mk === "done" ? "#2ed573" : mk === "bad" ? "#ff4757" : mk === "hint" ? "#f6c90e" : ((AF && AF.SYSCOL[e.def.sys]) || "#b8c4d0");
      return new T.Color(hex);
    }
    const tmpV = new T.Vector3();
    function worldOf(e) {
      if (e.static) return e.static;
      if (e.anchor) { e.anchor.getWorldPosition(e.pos); return e.pos; }
      return e.pos;
    }

    /* ---- sizing ---- */
    function size() {
      const cw = Math.max(120, wrap.clientWidth || el.clientWidth || 320);
      const ch = Math.round(Math.max(240, Math.min(innerHeight * 0.6, cw * (cw < 520 ? 0.95 : 0.62))));
      wrap.style.height = ch + "px";
      dpr = Math.min(2, window.devicePixelRatio || 1);
      let pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
      if (pw * ph > 4.2e6) { const k = Math.sqrt(4.2e6 / (pw * ph)); pw = Math.round(pw * k); ph = Math.round(ph * k); }
      w = cw; h = ch;
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      cam.aspect = cw / ch; cam.updateProjectionMatrix();
      dots.material.size = 12 * dpr; rings.material.size = 22 * dpr; beads.material.size = 5.5 * dpr;
      dirty = true;
    }

    /* ---- camera ---- */
    function placeCam() {
      const a = cs.az * D2R, e = cs.el * D2R, aspectK = Math.max(1, 1.05 / cam.aspect);
      const d = cs.dist * (scene === "airplane" ? aspectK : Math.max(1, 0.9 / cam.aspect) * (1 + 0.5 * explode));
      cam.position.set(tgt.x + d * Math.cos(e) * Math.cos(a), tgt.y + d * Math.sin(e), tgt.z + d * Math.cos(e) * Math.sin(a));
      cam.lookAt(tgt);
    }

    /* ---- render ---- */
    function project(v) { tmpV.copy(v).project(cam); return [(tmpV.x + 1) / 2 * w, (1 - tmpV.y) / 2 * h, tmpV.z]; }
    function updateOverlays() {
      let nd = 0, nr = 0;
      const dc = dots.geometry.attributes.color.array, dp = dots.geometry.attributes.position.array;
      const rc = rings.geometry.attributes.color.array, rp = rings.geometry.attributes.position.array;
      const showAll = false;
      for (const e of ent) {
        const act = isActive(e), wv = worldOf(e), p = project(wv);
        e.sx = p[0]; e.sy2 = p[1]; e.act = act && p[2] < 1;
        if (act) {
          const col = colorOf(e);
          dp[nd * 3] = wv.x; dp[nd * 3 + 1] = wv.y; dp[nd * 3 + 2] = wv.z;
          dc[nd * 3] = col.r; dc[nd * 3 + 1] = col.g; dc[nd * 3 + 2] = col.b; nd++;
          const isSel = e.def.id === selected, mk = marks[e.def.id];
          if (isSel || mk) {
            rp[nr * 3] = wv.x; rp[nr * 3 + 1] = wv.y; rp[nr * 3 + 2] = wv.z;
            const rcCol = isSel ? new T.Color("#ffffff") : col;
            rc[nr * 3] = rcCol.r; rc[nr * 3 + 1] = rcCol.g; rc[nr * 3 + 2] = rcCol.b; nr++;
          }
        }
        const show = labelsOn && act && p[2] < 1 && (e.def.id === selected || (focus ? e.def.sys === focus : showAll));
        if (show) {
          e.el.style.display = "block";
          e.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) translate(-50%,-135%)`;
        } else e.el.style.display = "none";
        e.el.classList.toggle("on", e.def.id === selected);
      }
      dots.geometry.setDrawRange(0, nd); rings.geometry.setDrawRange(0, nr);
      dots.geometry.attributes.position.needsUpdate = dots.geometry.attributes.color.needsUpdate = true;
      rings.geometry.attributes.position.needsUpdate = rings.geometry.attributes.color.needsUpdate = true;
      if (scene === "engine") E.cyl.forEach((c, k) => {
        const p = project(E.strokeLabelAnchors[k].getWorldPosition(tmpV.clone()));
        strokeEls[k].style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) translate(-50%,-100%)`;
        strokeEls[k].style.display = p[2] < 1 ? "block" : "none";
      });
    }
    function updateBeads(t) {
      const bp = beads.geometry.attributes.position.array, bc = beads.geometry.attributes.color.array;
      let n = 0;
      for (const b of beadList) {
        const u = (b.t0 + t * 0.00022) % 1, pt = b.r.curve.getPointAt(u), col = new T.Color(b.r.c).lerp(new T.Color("#ffffff"), 0.5);
        bp[n * 3] = pt.x; bp[n * 3 + 1] = pt.y; bp[n * 3 + 2] = pt.z; bc[n * 3] = col.r; bc[n * 3 + 1] = col.g; bc[n * 3 + 2] = col.b; n++;
      }
      beads.geometry.setDrawRange(0, n);
      beads.geometry.attributes.position.needsUpdate = beads.geometry.attributes.color.needsUpdate = true;
    }
    function render(t) {
      if (A) {
        A.root.updateMatrixWorld(true);
        // a slow idle spin is not wanted: the propeller stays put in the walkaround
      } else E.group.updateMatrixWorld(true);
      placeCam(); cam.updateMatrixWorld(true);
      sc.updateMatrixWorld(true);
      if (beadList.length) updateBeads(t || 0); else beads.geometry.setDrawRange(0, 0);
      updateOverlays();
      const pw = canvas.width, ph = canvas.height;
      if (rdr.domElement.width !== pw || rdr.domElement.height !== ph) rdr.setSize(pw, ph, false);
      rdr.render(sc, cam);
      ctx2.drawImage(rdr.domElement, 0, 0, pw, ph);
    }

    /* ---- loop ---- */
    const loopWanted = () => playing || fading || (beadList.length > 0 && !reduced);
    function frame(t) {
      raf = 0;
      if (destroyed || !visible) return;
      if (playing) {
        const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
        crank = (crank + dt * 110) % 720; E.update(explode, crank, cut); dirty = true;
        if (o.onTick && t - lastTick > 90) { lastTick = t; try { o.onTick(crank); } catch (e) { } }
      }
      lastT = t;
      if (fading) stepFade();
      if (dirty || beadList.length) { render(t); dirty = false; }
      if (loopWanted()) raf = requestAnimationFrame(frame); else lastT = 0;
    }
    function need() { if (!raf && !destroyed && visible) raf = requestAnimationFrame(frame); }
    const invalidate = () => { dirty = true; need(); };

    /* ---- input: orbit, pinch, wheel, tap-to-pick ---- */
    const ptrs = new Map();
    let moved = 0, downT = 0, pinch0 = 0, dist0 = 0;
    const clampCam = () => { cs.el = Math.max(CAM.elMin, Math.min(CAM.elMax, cs.el)); cs.dist = Math.max(CAM.min, Math.min(CAM.max, cs.dist)); };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { moved = 0; downT = performance.now(); canvas.style.cursor = "grabbing"; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cs.dist; moved = 99; }
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (ptrs.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved >= 6) { cs.az += dx * 0.45; cs.el += dy * 0.35; clampCam(); invalidate(); }
      } else if (ptrs.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) { cs.dist = dist0 * pinch0 / Math.max(10, d); clampCam(); invalidate(); }
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => {
      const had = ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) canvas.style.cursor = "grab";
      if (had && e.type === "pointerup" && moved < 6 && performance.now() - downT < 700) tap(e.clientX, e.clientY);
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); cs.dist *= Math.exp(e.deltaY * 0.0012); clampCam(); invalidate(); }, { passive: false });
    canvas.addEventListener("dblclick", () => resetCamera());
    canvas.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowLeft") cs.az -= 8; else if (k === "ArrowRight") cs.az += 8; else if (k === "ArrowUp") cs.el += 6; else if (k === "ArrowDown") cs.el -= 6;
      else if (k === "+" || k === "=") cs.dist *= 0.9; else if (k === "-") cs.dist *= 1.1; else if (k === "0") resetCamera(); else return;
      e.preventDefault(); clampCam(); invalidate();
    });

    const ray = new T.Raycaster();
    const deepVisible = (o3) => { for (let p = o3; p; p = p.parent) if (!p.visible) return false; return true; };
    function hitTest(cx, cy) {
      const r = canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
      render(performance.now());   // make sure projections are current
      // 1) nearest dot in screen space (these are the enlarged invisible pick targets)
      let best = null, bd = 1e9;
      for (const e of ent) {
        if (!e.act) continue;
        const d = Math.hypot(e.sx - x, e.sy2 - y), thr = Math.max(18, (e.def.r || 0.3) * pxPerFt(e));
        if (d < thr && d < bd) { bd = d; best = e; }
      }
      if (best) return best.def.id;
      // 2) nearest tagged mesh under the pointer (only meshes of pickable systems)
      ray.setFromCamera(new T.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), cam);
      const hits = ray.intersectObjects(R.tagged, false);
      for (const hh of hits) {
        if (!deepVisible(hh.object)) continue;
        const id = hh.object.userData.id, e = byId[id];
        if (!e) continue;
        if (focus && e.def.sys !== focus) continue;
        return id;
      }
      return null;
    }
    function pxPerFt(e) {
      const wv = worldOf(e), d = cam.position.distanceTo(wv);
      return h / (2 * d * Math.tan(cam.fov * D2R / 2));
    }
    function tap(cx, cy) { const id = hitTest(cx, cy); if (id) fire(id); }
    function fire(id) {
      const e = byId[id]; if (!e) return;
      selected = id; invalidate();
      if (o.onPick) { try { o.onPick({ id, sys: e.def.sys, part: e.def.part }); } catch (er) { console.error(er); } }
    }

    /* ---- observers ---- */
    let io = null, ro = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver((es) => { const v = es.some((x) => x.isIntersecting); if (v !== visible) { visible = v; if (v) { dirty = true; need(); } } });
      io.observe(wrap);
    }
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(() => { if (!destroyed) { size(); need(); } }); ro.observe(el); }
    else addEventListener("resize", onWinResize);
    function onWinResize() { size(); need(); }
    const onVis = () => { if (!document.hidden) { dirty = true; need(); } };
    document.addEventListener("visibilitychange", onVis);

    /* ---- API ---- */
    function resetCamera() { cs.az = CAM.az; cs.el = CAM.el; cs.dist = CAM.dist; invalidate(); }
    const view = {
      setFocus(sys) { focus = sys || null; applyFocus(); },
      select(id) { selected = id && byId[id] ? id : null; invalidate(); },
      mark(m) { for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, m || {}); invalidate(); },
      set(key, val) {
        if (destroyed) return;
        if (key === "xray") { xray = !!val; applyFocus(); }
        else if (key === "labels") { labelsOn = !!val; invalidate(); }
        else if (scene === "engine") {
          if (key === "explode") { explode = Math.max(0, Math.min(1, +val || 0)); E.update(explode, crank, cut); invalidate(); }
          else if (key === "cut") { cut = !!val; applyCut(); }
          else if (key === "crank") { crank = ((+val || 0) % 720 + 720) % 720; E.update(explode, crank, cut); invalidate(); }
          else if (key === "play") { playing = !!val; lastT = 0; if (playing) need(); }
        }
      },
      get(key) { return key === "crank" ? crank : key === "explode" ? explode : key === "cut" ? cut : key === "play" ? playing : key === "xray" ? xray : undefined; },
      pick(id) { if (!destroyed) fire(id); },
      resetCamera,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(raf);
        io && io.disconnect(); ro && ro.disconnect();
        removeEventListener("resize", onWinResize);
        document.removeEventListener("visibilitychange", onVis);
        ptrs.clear();
        sc.traverse((o3) => {
          if (o3.geometry) o3.geometry.dispose();
          const ms = o3.material ? (Array.isArray(o3.material) ? o3.material : [o3.material]) : [];
          ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        });
        texDot.dispose(); texRing.dispose();
        try { wrap.remove(); } catch (e) { }
        R.mats.length = 0; R.tagged.length = 0;
      },
    };

    size();
    if (scene === "engine") E.update(explode, crank, cut);
    for (const m of R.mats) { /* initial state */ }
    applyFocus();
    stepFade();
    // initial option values
    if (o.xray) view.set("xray", true);
    render(performance.now()); dirty = false;
    need();
    return view;
  }

  return { supported, load, ids, mount };
})();
window.Systems3D = Systems3D;
