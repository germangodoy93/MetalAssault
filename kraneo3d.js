/* KRANEO 3D — "Gritos de guerra".
   Interactive three.js scene for the "Kraneo" tab. three.js is loaded
   only the first time the tab is opened, and the render loop runs only
   while the tab is visible.
   API: Kraneo3D.show() / Kraneo3D.hide(). */
(function () {
  'use strict';
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var state = 'idle'; // idle | loading | ready | failed
  var wanted = false; // tab currently shown
  var api = null;     // {start, stop} once the scene exists

  function rootEl() { return document.getElementById('k3d'); }
  function setStatus(text, isError) {
    var el = rootEl().querySelector('.k3d-status');
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('error', !!isError);
  }
  function loadThree(cb) {
    if (window.THREE) return cb(true);
    var s = document.createElement('script');
    s.src = THREE_URL;
    s.crossOrigin = 'anonymous';
    s.onload = function () { cb(!!window.THREE); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  function show() {
    wanted = true;
    if (state === 'ready') { api.start(); return; }
    if (state !== 'idle') return;
    state = 'loading';
    setStatus('Cargando a KRANEO…');
    loadThree(function (ok) {
      if (!ok) { state = 'failed'; setStatus('No se pudo cargar el 3D. Revisa tu conexión y recarga la página.', true); return; }
      try { api = init(rootEl()); } catch (e) { api = null; }
      if (!api) { state = 'failed'; setStatus('No se pudo iniciar el 3D en este dispositivo.', true); return; }
      state = 'ready';
      setStatus('');
      if (wanted) api.start();
    });
  }
  function hide() {
    wanted = false;
    if (api) api.stop();
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!api) return;
    if (document.hidden) api.stop(); else if (wanted) api.start();
  });
  window.Kraneo3D = { show: show, hide: hide };

  /* ------------------------------------------------------------------ */
  function init(root) {
    var THREE = window.THREE;
    var stage = root.querySelector('.k3d-canvas');
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(renderer.domElement);
    var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reduced() { return !!(motionQuery && motionQuery.matches); }

    var ACC = 0xD3121B, EYE = 0xFF2A2A, BG = 0x121214;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 10, 26);
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    /* ---------- materials ---------- */
    var boneMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: .26, metalness: .55 });
    var lineMat = new THREE.MeshBasicMaterial({ color: ACC, side: THREE.BackSide });
    var ivoryMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, roughness: .5 });
    var chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e7, roughness: .18, metalness: .75 });
    var eyeMat = new THREE.MeshBasicMaterial({ color: EYE });
    var blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    /* ---------- helpers ---------- */
    function outl(parent, geoFn, mat, grow) {
      var g = (grow === undefined) ? 0.02 : grow;
      var m = new THREE.Mesh(geoFn(0), mat || boneMat);
      m.add(new THREE.Mesh(geoFn(g), lineMat));
      parent.add(m); return m;
    }
    function bone(parent, len, r) {
      var g = new THREE.Group();
      var s = outl(g, function (k) { return new THREE.CylinderGeometry(r + k, r + k, len, 10); });
      s.position.y = -len / 2;
      outl(g, function (k) { return new THREE.SphereGeometry(r * 1.75 + k, 12, 10); });
      var e = outl(g, function (k) { return new THREE.SphereGeometry(r * 1.75 + k, 12, 10); });
      e.position.y = -len;
      parent.add(g); return g;
    }
    function glowTex() {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    var gTex = glowTex();
    function glow(parent, color, size) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, color: color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      s.scale.set(size, size, 1); parent.add(s); return s;
    }
    var i;

    /* ---------- KRANEO ---------- */
    var kroot = new THREE.Group(); scene.add(kroot);
    var hips = new THREE.Group(); hips.position.y = 1.75; kroot.add(hips);

    var pelvis = outl(hips, function (k) { return new THREE.TorusGeometry(.27, .09 + k, 10, 24); });
    pelvis.rotation.x = Math.PI / 2; pelvis.scale.y = .75;
    outl(hips, function (k) { return new THREE.BoxGeometry(.2 + 2 * k, .26 + 2 * k, .14 + 2 * k); }).position.set(0, -.05, -.16);
    var belt = new THREE.Mesh(new THREE.TorusGeometry(.33, .05, 8, 28), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: .6 }));
    belt.rotation.x = Math.PI / 2; belt.scale.y = .78; belt.position.y = .12; hips.add(belt);
    (function () {
      var c = document.createElement('canvas'); c.width = 128; c.height = 96; var x = c.getContext('2d');
      x.fillStyle = '#d9dce1'; x.fillRect(0, 0, 128, 96); x.strokeStyle = '#D3121B'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 88);
      x.fillStyle = '#121214'; x.font = 'bold 64px Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MA', 64, 52);
      var mats = [chromeMat, chromeMat, chromeMat, chromeMat, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: .3, metalness: .4 }), chromeMat];
      var b = new THREE.Mesh(new THREE.BoxGeometry(.22, .16, .04), mats); b.position.set(0, .12, .28); hips.add(b);
    })();
    for (i = 0; i < 4; i++) { outl(hips, function (k) { return new THREE.CylinderGeometry(.07 + k, .07 + k, .09, 10); }).position.set(0, .16 + i * .12, -.1); }

    // chest
    var chest = new THREE.Group(); chest.position.y = .55; hips.add(chest);
    for (i = 0; i < 9; i++) { outl(chest, function (k) { return new THREE.CylinderGeometry(.065 + k, .065 + k, .09, 10); }).position.set(0, .08 + i * .125, -.14); }
    [.33, .38, .41, .4, .35].forEach(function (R, j) {
      var r = outl(chest, function (k) { return new THREE.TorusGeometry(R, .036 + k, 8, 30); }, boneMat, .016);
      r.rotation.x = Math.PI / 2; r.scale.y = .7; r.position.set(0, .2 + j * .16, .02);
    });
    outl(chest, function (k) { return new THREE.BoxGeometry(.1 + 2 * k, .62 + 2 * k, .06 + 2 * k); }).position.set(0, .5, .29);
    var core = new THREE.Mesh(new THREE.SphereGeometry(.07, 14, 12), eyeMat); core.position.set(0, .62, .34); chest.add(core);
    var coreGlow = glow(core, ACC, .9);
    var coreLight = new THREE.PointLight(ACC, 1.2, 3); core.add(coreLight);
    var clav = outl(chest, function (k) { return new THREE.CylinderGeometry(.045 + k, .045 + k, 1.2, 10); });
    clav.rotation.z = Math.PI / 2; clav.position.set(0, .97, .04);
    outl(chest, function (k) { return new THREE.CylinderGeometry(.07 + k, .07 + k, .3, 10); }).position.set(0, 1.15, -.06);

    // head
    var head = new THREE.Group(); head.position.set(0, 1.72, 0); chest.add(head);
    var cran = outl(head, function (k) { return new THREE.SphereGeometry(.44 + k, 28, 20); }, boneMat, .022);
    cran.scale.set(1, 1.05, 1.12);
    outl(head, function (k) { return new THREE.BoxGeometry(.5 + 2 * k, .3 + 2 * k, .36 + 2 * k); }).position.set(0, -.34, .2);
    var eyeGlows = [];
    [-1, 1].forEach(function (s) {
      var so = new THREE.Mesh(new THREE.SphereGeometry(.125, 16, 12), blackMat); so.scale.z = .5; so.position.set(s * .17, -.02, .43); head.add(so);
      var e = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 10), eyeMat); e.position.set(s * .17, -.02, .475); head.add(e);
      eyeGlows.push(glow(e, EYE, .5));
      var br = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .06), boneMat); br.position.set(s * .17, .11, .45); br.rotation.z = -s * .42; head.add(br);
      var h = outl(head, function (k) { return new THREE.ConeGeometry(.085 + k, .46 + 2 * k, 12); }, ivoryMat, .014);
      h.position.set(s * .6, .3, 0); h.rotation.z = -s * 1.05;
    });
    var nose = new THREE.Mesh(new THREE.ConeGeometry(.055, .11, 3), new THREE.MeshBasicMaterial({ color: 0x4a070b }));
    nose.position.set(0, -.2, .455); head.add(nose);
    [[.03, .3, .385, .5], [-.02, .2, .452, -.6], [.04, .11, .484, .5]].forEach(function (c) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(.028, .14, .02), eyeMat); m.position.set(c[0], c[1], c[2]); m.rotation.z = c[3]; head.add(m);
    });
    for (i = 0; i < 6; i++) { var tu = new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .04), ivoryMat); tu.position.set(-.18 + i * .072, -.52, .385); head.add(tu); }
    var jaw = new THREE.Group(); jaw.position.set(0, -.42, 0); head.add(jaw);
    outl(jaw, function (k) { return new THREE.BoxGeometry(.46 + 2 * k, .13 + 2 * k, .4 + 2 * k); }).position.set(0, -.25, .18);
    for (i = 0; i < 6; i++) { var tl = new THREE.Mesh(new THREE.BoxGeometry(.06, .09, .04), ivoryMat); tl.position.set(-.18 + i * .072, -.15, .35); jaw.add(tl); }
    var mouthGlow = glow(jaw, ACC, .01); mouthGlow.position.set(0, -.1, .3);

    // arms
    function arm(s) {
      var sh = new THREE.Group(); sh.position.set(s * .62, .95, .04); chest.add(sh);
      bone(sh, .75, .055);
      var el = new THREE.Group(); el.position.y = -.75; sh.add(el);
      bone(el, .7, .035).position.x = .045; bone(el, .7, .035).position.x = -.045;
      var hand = new THREE.Group(); hand.position.y = -.7; el.add(hand);
      outl(hand, function (k) { return new THREE.BoxGeometry(.15 + 2 * k, .16 + 2 * k, .07 + 2 * k); }, boneMat, .014).position.y = -.1;
      for (var f = 0; f < 4; f++) {
        var fg = outl(hand, function (k) { return new THREE.CylinderGeometry(.018 + k, .018 + k, .14, 6); }, boneMat, .01);
        fg.position.set(-.054 + f * .036, -.22, .05); fg.rotation.x = -1.0;
      }
      return { sh: sh, el: el, hand: hand };
    }
    var armL = arm(1), armR = arm(-1);

    // spiked chrome pauldron (left shoulder)
    (function () {
      var p = new THREE.Mesh(new THREE.SphereGeometry(.27, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), chromeMat);
      p.position.set(.04, .02, 0); p.rotation.z = -.35; armL.sh.add(p);
      [[0, 0], [.5, .9], [.5, -.9], [.75, 0]].forEach(function (a) {
        var c = new THREE.Mesh(new THREE.ConeGeometry(.045, .2, 8), chromeMat);
        var d = new THREE.Vector3(Math.sin(a[0]) * Math.cos(a[1]), Math.cos(a[0]), Math.sin(a[0]) * Math.sin(a[1]));
        c.position.copy(d.clone().multiplyScalar(.34)); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); p.add(c);
      });
    })();

    // controller
    function makeCtrl(parent, cable) {
      var g = new THREE.Group(); g.position.set(0, -.24, .12); parent.add(g);
      var dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .45 });
      outl(g, function (k) { return new THREE.BoxGeometry(.52 + 2 * k, .26 + 2 * k, .1 + 2 * k); }, dark, .018);
      [-1, 1].forEach(function (s) {
        outl(g, function (k) { return new THREE.CylinderGeometry(.075 + k, .06 + k, .22, 12); }, dark, .018).position.set(s * .22, -.16, 0);
        var st = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .05, 12), chromeMat); st.rotation.x = Math.PI / 2; st.position.set(s * .09, -.06, .07); g.add(st);
      });
      var d1 = new THREE.Mesh(new THREE.BoxGeometry(.1, .03, .02), chromeMat), d2 = new THREE.Mesh(new THREE.BoxGeometry(.03, .1, .02), chromeMat);
      d1.position.set(-.17, .05, .06); d2.position.set(-.17, .05, .06); g.add(d1); g.add(d2);
      [[.13, .05], [.21, .05], [.17, .09], [.17, .01]].forEach(function (b, ix) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 8), ix === 2 ? eyeMat : chromeMat); m.position.set(b[0], b[1], .055); g.add(m);
        if (ix === 2) glow(m, ACC, .2);
      });
      var curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .13, 0), new THREE.Vector3(.2, .3, .16), new THREE.Vector3(.12, .6, .1), new THREE.Vector3(0, .72, 0)]);
      if (cable) g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .014, 6), eyeMat));
      return g;
    }
    var kCtrl = makeCtrl(armR.hand, true);

    // legs
    function leg(s) {
      var hp = new THREE.Group(); hp.position.set(s * .24, -.08, 0); hips.add(hp);
      bone(hp, .8, .062);
      var kn = new THREE.Group(); kn.position.y = -.8; hp.add(kn);
      bone(kn, .8, .04).position.x = .04; bone(kn, .8, .03).position.x = -.05;
      var ft = new THREE.Group(); ft.position.y = -.8; kn.add(ft);
      outl(ft, function (k) { return new THREE.BoxGeometry(.18 + 2 * k, .09 + 2 * k, .42 + 2 * k); }, boneMat, .016).position.set(0, -.03, .12);
      return { hp: hp, kn: kn, ft: ft };
    }
    var legL = leg(1), legR = leg(-1);

    /* ---------- GLITCHY ---------- */
    var gl = new THREE.Group(); gl.visible = false; scene.add(gl);
    var glBody = new THREE.Group(); gl.add(glBody);
    (function () {
      function px(w, h, d, col, x, y, z, par, basic) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshStandardMaterial({ color: col, roughness: .7, flatShading: true }));
        m.position.set(x, y, z); (par || glBody).add(m); return m;
      }
      var PUR = 0x7b4dff, LIL = 0xa98bff, IND = 0x2a145e, TAIL = 0x5a36c9, YEL = 0xffd23a;
      var bg = new THREE.SphereGeometry(.58, 9, 7);
      [[0x46c8ff, -.08], [0xd3121b, .08]].forEach(function (e) {
        var g = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: e[0], transparent: true, opacity: .35, depthWrite: false }));
        g.position.set(e[1], 0, -.05); g.scale.set(1, 1.05, .9); glBody.add(g);
      });
      var body = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: PUR, roughness: .6, flatShading: true }));
      body.scale.set(1, 1.05, .9); glBody.add(body);
      [[-.2, -.3, .42], [0, -.42, .36], [.22, -.28, .42], [-.46, .2, .2], [.42, -.05, .3]].forEach(function (p) { px(.11, .11, .11, LIL, p[0], p[1], p[2]); });
      px(.52, .1, .44, IND, 0, -.06, .6); px(.06, .03, .05, LIL, -.1, 0, .78, null, true); px(.06, .03, .05, LIL, .1, 0, .78, null, true);
      px(.06, .09, .04, 0xffffff, -.12, -.15, .7, null, true); px(.06, .09, .04, 0xffffff, .12, -.15, .7, null, true);
      [-1, 1].forEach(function (sd) {
        var w = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); w.position.set(sd * .2, .22, .4); glBody.add(w);
        var ir = new THREE.Mesh(new THREE.SphereGeometry(.095, 10, 8), new THREE.MeshBasicMaterial({ color: YEL })); ir.position.set(sd * .2, .22, .47); glBody.add(ir);
        px(.03, .14, .03, 0x0a0a0c, sd * .2, .22, .565, null, true);
        var br = px(.3, .07, .1, IND, sd * .21, .38, .47); br.rotation.z = sd * .45;
        px(.3, .09, .4, IND, sd * .26, -.6, .14);
        px(.2, .1, .12, IND, sd * .62, -.02, .12);
      });
      px(.46, .12, .5, TAIL, 0, -.32, -.62); px(.34, .12, .24, TAIL, 0, -.32, -.96); px(.1, .1, .1, LIL, .1, -.24, -.7); px(.1, .1, .1, LIL, -.12, -.24, -.9);
      [[-.8, .5, .2], [.85, .3, -.3], [-.7, -.2, -.5], [.75, .7, .3]].forEach(function (p, ix) { px(.1, .1, .1, [PUR, LIL, 0x46c8ff, 0xd3121b][ix], p[0], p[1], p[2], null, true); });
    })();
    glBody.scale.set(1.15, 1.15, 1.15);
    var hitFx = glow(scene, 0xfff2a0, .01);
    var FACE = 1.0, DX = Math.sin(FACE), DZ = Math.cos(FACE), GR = 2.35;

    /* ---------- CRAZYMAN ---------- */
    var cm = new THREE.Group(); cm.visible = false; scene.add(cm);
    var cmB = new THREE.Group(); cm.add(cmB);
    var cmArmL, cmArmR, cmLegL, cmLegR, cmHead, cmCtrl;
    (function () {
      var line2 = new THREE.MeshBasicMaterial({ color: 0x2a2a2e, side: THREE.BackSide });
      function M(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: .65 }); }
      function B(c) { return new THREE.MeshBasicMaterial({ color: c }); }
      function o2(par, geoFn, mat, grow) { var g = (grow === undefined) ? .025 : grow; var m = new THREE.Mesh(geoFn(0), mat); m.add(new THREE.Mesh(geoFn(g), line2)); par.add(m); return m; }
      function bx(par, w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); par.add(m); return m; }
      var WH = M(0xe9e6df), STRAP = M(0x8a8578), SKIN = M(0xf1c7a0), HAIR = M(0xff7a1a), COAL = M(0x2b2b30), DARK = M(0x2a2a2e), LIME = 0xb6ff3b, SILV = M(0xc9ccd2);
      o2(cmB, function (k) { return new THREE.CylinderGeometry(.36 + k, .43 + k, 1.12 + 2 * k, 16); }, WH).position.y = 1.9;
      [2.08, 1.72].forEach(function (y, ix) {
        var t = new THREE.Mesh(new THREE.TorusGeometry(.405 + (ix ? .015 : 0), .04, 6, 24), STRAP); t.rotation.x = Math.PI / 2; t.position.y = y; cmB.add(t);
        bx(cmB, .09, .14, .05, SILV, 0, y, .43 + (ix ? .015 : 0));
      });
      var loose = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .42, 6), STRAP); loose.position.set(.44, 1.5, .05); loose.rotation.z = .25; cmB.add(loose);
      [[-.2, 2.3, .34, .07], [.18, 1.92, .4, .06], [-.1, 1.55, .42, .05]].forEach(function (p) {
        var st = new THREE.Mesh(new THREE.SphereGeometry(p[3], 8, 6), B(LIME)); st.scale.z = .3; st.position.set(p[0], p[1], p[2]); cmB.add(st);
      });
      (function () {
        var c = document.createElement('canvas'); c.width = 256; c.height = 80; var x = c.getContext('2d');
        x.fillStyle = '#e9e6df'; x.fillRect(0, 0, 256, 80); x.fillStyle = '#2a2a2e'; x.font = 'bold 54px Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AFK NUNCA', 128, 44, 240);
        var p = new THREE.Mesh(new THREE.PlaneGeometry(.5, .16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
        p.position.set(0, 1.9, .415); p.rotation.z = .1; cmB.add(p);
      })();
      o2(cmB, function (k) { return new THREE.CylinderGeometry(.13 + k, .13 + k, .2, 10); }, SKIN, .015).position.y = 2.5;
      cmHead = new THREE.Group(); cmHead.position.y = 2.92; cmB.add(cmHead);
      o2(cmHead, function (k) { return new THREE.SphereGeometry(.45 + k, 22, 16); }, SKIN).scale.y = 1.05;
      for (var n = 0; n < 10; n++) {
        var a = n / 10 * 6.283, h = o2(cmHead, function (k) { return new THREE.ConeGeometry(.13 + k, .6 + 2 * k, 7); }, HAIR, .018);
        var dir = new THREE.Vector3(Math.cos(a) * .8, .7 + .25 * (n % 2), Math.sin(a) * .55 - .15).normalize();
        h.position.copy(dir.clone().multiplyScalar(.55)); h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      o2(cmHead, function (k) { return new THREE.ConeGeometry(.15 + k, .66 + 2 * k, 7); }, HAIR, .018).position.y = .66;
      [-.22, 0, .22].forEach(function (x, ix) { var f = new THREE.Mesh(new THREE.ConeGeometry(.12, .22, 5), HAIR); f.position.set(x, .36 - .03 * (ix === 1), .32); f.rotation.x = 2.5; cmHead.add(f); });
      var band = new THREE.Mesh(new THREE.TorusGeometry(.5, .04, 6, 24, Math.PI), DARK); band.position.y = .02; cmHead.add(band);
      [-1, 1].forEach(function (sd) { bx(cmHead, .12, .3, .22, DARK, sd * .5, 0, 0); });
      bx(cmHead, .02, .14, .05, B(LIME), -.565, 0, .06);
      var mic = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .3, 6), DARK); mic.position.set(.42, -.22, .2); mic.rotation.set(.9, 0, .5); cmHead.add(mic);
      var cur = bx(cmHead, .2, .07, .03, M(0xe8c9a8), -.2, .27, .37); cur.rotation.set(-.45, -.35, .35);
      (function () {
        var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d');
        x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.strokeStyle = '#2a2a2e'; x.lineWidth = 6;
        [58, 42, 27, 13].forEach(function (r) { x.beginPath(); x.arc(64, 64, r, 0, 7); x.stroke(); });
        x.fillStyle = '#b6ff3b'; x.beginPath(); x.arc(64, 64, 6, 0, 7); x.fill();
        var e = new THREE.Mesh(new THREE.CircleGeometry(.16, 24), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        e.position.set(-.17, .03, .435); e.rotation.y = -.35; cmHead.add(e);
      })();
      var se = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), B(0xffffff)); se.position.set(.19, .02, .4); cmHead.add(se);
      var sp = new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 6), B(0x111111)); sp.position.set(.2, .02, .48); cmHead.add(sp);
      var b1 = bx(cmHead, .3, .045, .04, DARK, -.17, .24, .42); b1.rotation.z = -.22; var b2 = bx(cmHead, .2, .04, .04, DARK, .2, .15, .41); b2.rotation.z = .25;
      bx(cmHead, .2, .02, .02, B(0x7b5aa6), -.17, -.15, .42); bx(cmHead, .12, .02, .02, B(0x7b5aa6), .19, -.08, .42);
      bx(cmHead, .5, .2, .05, B(0x3a1010), 0, -.26, .38);
      for (n = 0; n < 6; n++) { bx(cmHead, .07, .08, .03, B(0xf7f3ea), -.2 + n * .08, -.21, .41); }
      bx(cmHead, .16, .05, .03, B(0xe06a7a), .04, -.33, .41);
      function limb(x, y, len, r, mat, endMat, endR) {
        var g = new THREE.Group(); g.position.set(x, y, 0); cmB.add(g);
        o2(g, function (k) { return new THREE.CylinderGeometry(r + k, r + k, len, 10); }, mat, .02).position.y = -len / 2;
        o2(g, function (k) { return new THREE.SphereGeometry(endR + k, 10, 8); }, endMat, .02).position.y = -len;
        return g;
      }
      cmArmL = limb(.5, 2.35, 1.05, .11, WH, SKIN, .14); cmArmR = limb(-.5, 2.35, 1.05, .11, WH, SKIN, .14);
      cmLegL = limb(.2, 1.35, 1.2, .13, COAL, M(LIME), .18); cmLegR = limb(-.2, 1.35, 1.2, .13, COAL, M(0xd3121b), .18);
      var can = new THREE.Group(); can.position.set(0, -1.28, 0); can.rotation.x = Math.PI; cmArmL.add(can);
      o2(can, function (k) { return new THREE.CylinderGeometry(.11 + k, .11 + k, .36 + 2 * k, 12); }, B(LIME), .015);
      var bandc = new THREE.Mesh(new THREE.CylinderGeometry(.113, .113, .1, 12), DARK); can.add(bandc);
      var topc = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, .04, 12), SILV); topc.position.y = .2; can.add(topc);
      glow(can, LIME, .5).position.y = .3;
      var hold = new THREE.Group(); hold.position.set(0, -1.0, 0); hold.rotation.x = Math.PI; cmArmR.add(hold);
      cmCtrl = makeCtrl(hold, false); cmCtrl.position.set(0, .3, .05); cmCtrl.visible = false;
    })();

    /* ---------- set ---------- */
    var floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .85 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    function ring(r1, r2, op) {
      var m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), new THREE.MeshBasicMaterial({ color: ACC, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = .01; scene.add(m); return m;
    }
    ring(1.5, 1.56, .8); ring(2.5, 2.53, .35);
    var wave = ring(.9, 1, 0);
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(.9, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .012; scene.add(shadow);
    var back = glow(scene, ACC, 10); back.position.set(0, 2.8, -3.5); back.material.opacity = .3;

    var N = 140, pos = new Float32Array(N * 3), spd = [];
    for (i = 0; i < N; i++) { var a = Math.random() * 6.283, r = 1.2 + Math.random() * 4.5; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = Math.sin(a) * r; spd.push(.3 + Math.random() * .8); }
    var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xff4a3a, size: .06, map: gTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

    scene.add(new THREE.AmbientLight(0x8a8a99, .55));
    var key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(2.5, 6, 6); scene.add(key);
    var rimA = new THREE.PointLight(ACC, 3.2, 14); rimA.position.set(-3.5, 3.5, -3); scene.add(rimA);
    var rimB = new THREE.PointLight(ACC, 3.2, 14); rimB.position.set(3.5, 2.5, -3); scene.add(rimB);
    var fill = new THREE.PointLight(0x6677aa, .6, 12); fill.position.set(-3, 1.5, 4); scene.add(fill);

    /* ---------- timeline ---------- */
    var LOOP = 8;
    var SCENES = [
      { id: 'guerra', voice: '¡Ataquen la Maldita Guerra!',
        lines: [[['¡Ataquen', 2.2]], [['la', 3.0], ['Maldita', 3.3]], [['Guerra!', 4.0, 1]]],
        syl: [[2.2, .2], [2.45, .2], [2.7, .22], [3.0, .22], [3.3, .2], [3.55, .2], [3.8, .18], [4.0, .25], [4.28, .95]] },
      { id: 'cabeza', voice: '¡Hay que cortarle la cabeza!',
        lines: [[['¡Hay que', 2.2]], [['cortarle', 2.9], ['la', 3.7]], [['cabeza!', 4.0, 1]]],
        syl: [[2.2, .22], [2.5, .25], [2.9, .2], [3.15, .2], [3.4, .2], [3.7, .22], [4.0, .2], [4.25, .2], [4.5, .8]] },
      { id: 'golpe', voice: '¡Toma!',
        lines: [[['¡Toma!', 3.05, 1]], [['K.O.', 4.7]]],
        syl: [[3.05, .2], [3.28, .7]] },
      { id: 'robo', voice: '¡Oye! ¡Mi control!',
        lines: [[['¡Oye!', 2.6]], [['¡Mi', 3.4]], [['control!', 3.7, 1]]],
        syl: [[2.6, .18], [2.8, .3], [3.4, .2], [3.7, .2], [3.95, .85]] }
    ];
    var sc = 0, locked = false, SYL = SCENES[0].syl, words = [];
    var shoutEl = root.querySelector('.k3d-shout'), slashEl = root.querySelector('.k3d-slash');
    var sbtn = Array.prototype.slice.call(root.querySelectorAll('[data-k3d-scene]'));
    var autoBtn = root.querySelector('[data-k3d-auto]');
    function setScene(n) {
      sc = n; SYL = SCENES[n].syl; words = []; shoutEl.textContent = '';
      SCENES[n].lines.forEach(function (L) {
        var d = document.createElement('div');
        L.forEach(function (w, ix) {
          if (ix) d.appendChild(document.createTextNode(' '));
          var sp = document.createElement('span'); sp.textContent = w[0]; if (w[2]) sp.className = 'big';
          d.appendChild(sp); words.push({ el: sp, t: w[1] });
        });
        shoutEl.appendChild(d);
      });
      sbtn.forEach(function (b, ix) { b.classList.toggle('sel', ix === n); b.setAttribute('aria-pressed', String(locked && ix === n)); });
      autoBtn.classList.toggle('sel', !locked); autoBtn.setAttribute('aria-pressed', String(!locked));
    }
    function ss(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    function mix(a, b, k) { return a + (b - a) * k; }
    function jawOpen(t) {
      var o = 0;
      for (var j = 0; j < SYL.length; j++) {
        var d = t - SYL[j][0], L = SYL[j][1];
        if (d >= 0 && d < L + .12) { var v = d < .05 ? d / .05 : (d < L ? 1 - .25 * (d - .05) / L : Math.max(0, .75 * (1 - (d - L) / .12))); if (v > o) o = v; }
      }
      return o;
    }

    /* ---------- interactions ---------- */
    var t0 = performance.now() / 1000, orbit = 0, dragging = null, lastX = 0;
    function restart(at) { t0 = performance.now() / 1000 - (at || 0); }
    // drag (mouse/touch) to orbit; vertical swipes still scroll the page
    stage.addEventListener('pointerdown', function (e) {
      dragging = e.pointerId; lastX = e.clientX; stage.classList.add('grabbing');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (dragging !== e.pointerId) return;
      orbit -= (e.clientX - lastX) * .008; lastX = e.clientX;
    });
    function endDrag() { dragging = null; stage.classList.remove('grabbing'); }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    // keyboard: arrows orbit, 1-4 pick a shout
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { orbit += .15; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { orbit -= .15; e.preventDefault(); }
      else if (/^[1-4]$/.test(e.key)) { pick(+e.key - 1); }
    });
    function pick(n) { locked = true; setScene(n); restart(1.3); }
    sbtn.forEach(function (b, n) { b.addEventListener('click', function () { pick(n); }); });
    autoBtn.addEventListener('click', function () { locked = false; setScene(sc); restart(0); });
    setScene(0);

    var vozBtn = root.querySelector('[data-k3d-voice]');
    if (!('speechSynthesis' in window)) vozBtn.hidden = true;
    vozBtn.addEventListener('click', function () {
      try {
        var u = new SpeechSynthesisUtterance(SCENES[sc].voice);
        u.lang = 'es-MX'; u.pitch = 0.1; u.rate = 0.75; u.volume = 1;
        var vs = speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); });
        if (vs.length) u.voice = vs[0];
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) {}
      locked = true; setScene(sc); restart(2.0);
    });

    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);
    resize();

    /* ---------- frame ---------- */
    function frame() {
      var now = performance.now() / 1000;
      if (now - t0 >= LOOP) { t0 += LOOP * Math.floor((now - t0) / LOOP); if (!locked) setScene((sc + 1) % SCENES.length); }
      var t = now - t0; if (t < 0) t = 0;
      var calm = reduced();
      var ant = ss(1.45, 2.05, t) * (1 - ss(2.08, 2.28, t));
      var sh = ss(2.08, 2.32, t) * (1 - ss(5.3, 6.5, t));
      var roar = sc === 3 ? ss(3.7, 3.85, t) * (1 - ss(4.7, 5.2, t)) : sc === 2 ? ss(3.05, 3.12, t) * (1 - ss(3.5, 4.1, t)) : ss(4.0, 4.2, t) * (1 - ss(5.0, 5.4, t));
      var rattle = calm ? 0 : roar;
      var jo = jawOpen(t);
      var br = Math.sin(now * 2.2);
      var slash = ss(4.0, 4.28, t);
      var k;

      armL.el.rotation.z = 0; chest.rotation.y = 0; kroot.rotation.y = 0; gl.visible = false; cm.visible = false; kCtrl.visible = true; hitFx.scale.set(.01, .01, 1);
      legL.hp.rotation.z = .13; legR.hp.rotation.z = -.13;
      if (sc === 0) {
        hips.position.y = 1.75 + br * .012 - .12 * sh + .04 * ant;
        hips.rotation.y = .12 * Math.sin(now * .7) * (1 - sh);
        chest.rotation.x = .02 * br - .28 * ant + .3 * sh + .05 * rattle * Math.sin(now * 40);
        head.rotation.x = -.25 * ant - .12 * sh - .22 * roar + .05 * jo;
        head.rotation.z = .05 * Math.sin(now * 1.3) + .04 * rattle * Math.sin(now * 47);
        armL.sh.rotation.x = mix(mix(.08, -2.95, ant), -1.75, sh) + .05 * br;
        armL.sh.rotation.z = mix(.16, .32, sh);
        armL.el.rotation.x = mix(mix(-.25, -1.5, ant), -.08, sh);
        armR.sh.rotation.x = mix(mix(-.35, -.1, ant), -2.85, sh) + .04 * br;
        armR.sh.rotation.z = mix(-.14, -.4, sh);
        armR.el.rotation.x = mix(-1.35, -.3, sh) + .05 * Math.sin(now * 9) * (1 - sh);
        armR.hand.rotation.x = mix(-.2, .5, sh);
        legL.hp.rotation.x = -.42 * sh; legL.kn.rotation.x = .55 * sh; legL.ft.rotation.x = -.13 * sh;
        legR.hp.rotation.x = .3 * sh; legR.kn.rotation.x = .18 * sh; legR.ft.rotation.x = -.48 * sh;
      } else if (sc === 1) {
        var g = ss(1.45, 2.05, t) * (1 - ss(5.3, 6.5, t));
        hips.position.y = 1.75 + br * .012 - .05 * g;
        hips.rotation.y = .12 * Math.sin(now * .7) * (1 - g);
        chest.rotation.x = .02 * br + .16 * g - .1 * slash * g + .04 * rattle * Math.sin(now * 40);
        chest.rotation.y = g * mix(-.22, .3, slash);
        head.rotation.x = .1 * ant - .3 * sh + .05 * jo;
        head.rotation.z = .05 * Math.sin(now * 1.3) + .2 * sh + .04 * rattle * Math.sin(now * 47);
        armL.sh.rotation.x = mix(.08, -.8, g) + .03 * br;
        armL.sh.rotation.z = mix(.16, -.5, g);
        armL.el.rotation.x = mix(-.25, -2.0, g);
        armL.el.rotation.z = g * mix(-1.0, .3, slash);
        armR.sh.rotation.x = -.35 + .04 * br; armR.sh.rotation.z = -.14 - .1 * g;
        armR.el.rotation.x = -1.35 + .05 * Math.sin(now * 9); armR.hand.rotation.x = -.2;
        legL.hp.rotation.x = legL.kn.rotation.x = legL.ft.rotation.x = 0;
        legR.hp.rotation.x = legR.kn.rotation.x = legR.ft.rotation.x = 0;
      }
      if (sc === 2) {
        var turn = ss(.6, 1.4, t) * (1 - ss(6.4, 7.4, t));
        var wind = ss(2.3, 2.85, t) * (1 - ss(2.9, 3.02, t));
        var pun = ss(2.9, 3.05, t) * (1 - ss(4.8, 5.8, t));
        kroot.rotation.y = FACE * turn;
        hips.position.y = 1.75 + br * .012 + .05 * wind - .16 * pun;
        hips.rotation.y = .1 * Math.sin(now * .7) * (1 - turn);
        chest.rotation.x = .02 * br - .12 * wind + .42 * pun + .04 * rattle * Math.sin(now * 40);
        chest.rotation.y = .5 * wind - .45 * pun;
        head.rotation.x = .05 * jo - .3 * pun + .1 * wind;
        head.rotation.z = .05 * Math.sin(now * 1.3);
        armL.sh.rotation.x = mix(mix(.08, .7, wind), -.9, pun) + .03 * br;
        armL.sh.rotation.z = .16;
        armL.el.rotation.x = mix(mix(-.25, -2.1, wind), -.05, pun);
        armR.sh.rotation.x = -.35 + .6 * pun + .04 * br; armR.sh.rotation.z = -.14 - .15 * pun;
        armR.el.rotation.x = -1.35 + .05 * Math.sin(now * 9); armR.hand.rotation.x = -.2;
        legL.hp.rotation.x = -.5 * pun; legL.kn.rotation.x = .55 * pun; legL.ft.rotation.x = -.05 * pun;
        legR.hp.rotation.x = .32 * pun; legR.kn.rotation.x = .18 * pun; legR.ft.rotation.x = -.5 * pun;
        // Glitchy
        k = t - 3.05;
        var rr, gy, mock = ss(1.3, 1.5, t);
        gl.visible = k < 1.7;
        glBody.rotation.set(0, 0, 0); gl.scale.set(1, 1, 1);
        if (k < 0) {
          rr = mix(7.5, GR, ss(.15, 1.3, t));
          gy = .78 + (t < 1.3 ? .45 * Math.abs(Math.sin(t * 7)) : .3 * mock * Math.abs(Math.sin(t * 9)));
          glBody.rotation.z = .18 * mock * Math.sin(t * 9);
          if (t > 2.9) glBody.scale.set(1.15, 1.15, 1.15 * (1 - .5 * ss(2.98, 3.05, t))); else glBody.scale.set(1.15, 1.15, 1.15);
        } else {
          rr = GR + k * 4.5; gy = .78 + k * 9 - k * k * 2;
          glBody.scale.set(1.15, 1.15, 1.15);
          glBody.rotation.x = -k * 13; glBody.rotation.z = k * 9;
          var shr = 1 - ss(.9, 1.7, k); gl.scale.set(shr, shr, shr);
          var fx = k < .35 ? (.01 + 7 * Math.sin(k / .35 * Math.PI)) : .01;
          hitFx.position.set(DX * (GR - .5), 2.0, DZ * (GR - .5)); hitFx.scale.set(fx, fx, 1);
        }
        gl.position.set(DX * rr, gy, DZ * rr); gl.rotation.y = FACE + Math.PI + .8;
      }
      if (sc === 3) {
        var TS = 2.45, stolen = t >= TS;
        var st = ss(TS - .03, TS + .1, t) * (1 - ss(3.15, 3.4, t));
        var an = ss(3.3, 3.55, t) * (1 - ss(5.8, 6.8, t));
        var play = 1 - ss(TS - .05, TS + .1, t) + ss(7.2, 7.9, t);
        kCtrl.visible = !stolen; cmCtrl.visible = stolen;
        kroot.rotation.y = 1.0 * an;
        hips.position.y = 1.75 + br * .012 + .18 * st - .08 * an;
        hips.rotation.y = 0;
        chest.rotation.x = .02 * br + .1 * play - .15 * st + .22 * an + .04 * rattle * Math.sin(now * 40);
        head.rotation.x = .28 * play - .25 * st - .15 * an + .05 * jo;
        head.rotation.z = .05 * Math.sin(now * 1.3) + .04 * rattle * Math.sin(now * 47);
        armR.sh.rotation.x = mix(mix(-.35, -.6, st), -2.6, an) + .04 * br;
        armR.sh.rotation.z = mix(mix(-.14, -.9, st), -.3, an);
        armR.el.rotation.x = mix(mix(-1.35, -.9, st), -1.3 + .35 * Math.sin(now * 14), an) + .05 * Math.sin(now * 9) * play;
        armR.hand.rotation.x = -.2;
        armL.sh.rotation.x = mix(mix(-.2, -.6, st), -1.6, an) + .03 * br;
        armL.sh.rotation.z = mix(mix(.16, .9, st), .2, an);
        armL.el.rotation.x = mix(mix(-.9, -.9, st), -.1, an);
        legL.hp.rotation.x = -.3 * an; legL.kn.rotation.x = .35 * an; legL.ft.rotation.x = -.05 * an;
        legR.hp.rotation.x = .2 * an; legR.kn.rotation.x = .1 * an; legR.ft.rotation.x = -.3 * an;
        // Crazyman
        cm.visible = t > .25 && t < 5.7;
        var run = Math.max(0, t - TS), cx, cz, ph;
        if (!stolen) {
          var ap = ss(.3, 2.15, t);
          cx = mix(-3.4, -1.8, ap); cz = mix(-3.6, .5, ap); ph = t * 9;
          cm.rotation.y = mix(.35, Math.PI / 2, ss(.6, 1, ap));
          cmB.rotation.x = .3; cmB.position.y = -.12 + .05 * Math.abs(Math.sin(ph));
          cmLegL.rotation.x = .45 * Math.sin(ph) * (1 - ss(2.1, 2.25, t)); cmLegR.rotation.x = -.45 * Math.sin(ph) * (1 - ss(2.1, 2.25, t));
          var reach = ss(2.15, 2.42, t);
          cmArmR.rotation.x = mix(-1.1 + .15 * Math.sin(ph), -1.45, reach); cmArmR.rotation.z = 0;
          cmArmL.rotation.x = -2.7 + .12 * Math.sin(ph); cmArmL.rotation.z = .2;
          cmHead.rotation.set(-.2, .5 * Math.sin(t * 3) * (1 - reach), 0);
        } else {
          var u = Math.pow(run / 2.6, 1.5);
          cx = -1.8 + 6.5 * u; cz = mix(.5, 2.0, ss(0, .35, run)); ph = t * 20;
          cm.rotation.y = Math.PI / 2 - .5 * (1 - ss(.1, .6, run));
          cmB.rotation.x = .28; cmB.position.y = .16 * Math.abs(Math.sin(ph));
          cmLegL.rotation.x = 1.0 * Math.sin(ph); cmLegR.rotation.x = -1.0 * Math.sin(ph);
          cmArmR.rotation.x = mix(-1.45, -3.0, ss(0, .3, run)) + .12 * Math.sin(ph); cmArmR.rotation.z = .15 * Math.sin(ph * .5);
          cmArmL.rotation.x = -2.5 + .3 * Math.sin(ph); cmArmL.rotation.z = .25;
          cmHead.rotation.set(-.25, -1.1 * ss(.3, .7, run), .15 * Math.sin(ph * .5));
        }
        cm.position.set(cx, 0, cz);
      }
      chest.rotation.z = .03 * Math.sin(now * 1.1);
      head.rotation.y = .1 * Math.sin(now * .9) * (1 - sh);
      jaw.rotation.x = .04 + .5 * jo + .12 * roar;
      slashEl.classList.toggle('on', sc === 1 && t >= 4.0 && t < 4.7);

      // glows
      var pulse = .5 + .5 * Math.sin(now * 5);
      var es = .45 + .12 * pulse + .3 * ant + .4 * sh * (.6 + .4 * jo) + .25 * roar;
      eyeGlows[0].scale.set(es, es, 1); eyeGlows[1].scale.set(es, es, 1);
      var cs = .8 + .2 * pulse + 1.2 * roar; coreGlow.scale.set(cs, cs, 1); coreLight.intensity = 1.2 + 3 * roar;
      var ms = .01 + .45 * jo * sh; mouthGlow.scale.set(ms, ms * .7, 1);
      back.material.opacity = .26 + .1 * pulse + .45 * roar;
      rimA.intensity = rimB.intensity = 3.2 + 3.5 * roar;
      var wv = t - 4.0;
      if (sc === 0 && wv > 0 && wv < 1.2) { k = wv / 1.2; wave.scale.set(1 + k * 7, 1 + k * 7, 1); wave.material.opacity = .9 * (1 - k); } else { wave.material.opacity = 0; }

      // embers
      var p = eg.attributes.position.array, dt = .016 * (1 + 3 * roar);
      for (var j = 0; j < N; j++) { p[j * 3 + 1] += spd[j] * dt; if (p[j * 3 + 1] > 6.5) p[j * 3 + 1] = 0; }
      eg.attributes.position.needsUpdate = true;

      // camera
      var portrait = camera.aspect < 1, d, ang, ty, tx = 0, tz = 0, cy, shk = rattle * .05;
      if (sc === 2) {
        d = portrait ? 11.5 : 8.8; ang = orbit - .3 + .08 * Math.sin(now * .45); ty = 1.7; cy = 2.3;
        var f = ss(.3, 1.4, t) * (1 - ss(6.4, 7.6, t)); tx = DX * 1.25 * f; tz = DZ * 1.25 * f; shk = rattle * .09;
      } else if (sc === 3) {
        var chase = ss(2.6, 4.2, t) * (1 - ss(6, 7.2, t));
        d = portrait ? mix(11.8, 14.5, chase) : mix(8.8, 10.5, chase); ang = orbit + .08 * Math.sin(now * .45); ty = 2.0; cy = 2.4;
        tx = 1.0 * chase; shk = rattle * .07;
      } else {
        d = (portrait ? 10.2 : 8.2) * (1 - (portrait ? (sc ? .24 : .12) : .3) * sh); ang = orbit + .4 * Math.sin(now * .45) - .25 * sh;
        ty = mix(2.3, portrait ? (sc ? 2.9 : 2.75) : 3.1, sh); cy = mix(2.6, 2.2, sh);
      }
      camera.position.set(tx + Math.sin(ang) * d + (Math.random() - .5) * shk, cy + (Math.random() - .5) * shk, tz + Math.cos(ang) * d);
      camera.lookAt(tx, ty, tz);

      // shout text
      for (j = 0; j < words.length; j++) { words[j].el.classList.toggle('on', t >= words[j].t && t < 6.2); }

      renderer.render(scene, camera);
    }

    var raf = 0, running = false, pausedAt = 0;
    function loop() { if (!running) return; frame(); raf = requestAnimationFrame(loop); }
    return {
      start: function () {
        if (running) return;
        if (pausedAt) t0 += performance.now() / 1000 - pausedAt; // resume where it stopped
        running = true; resize(); raf = requestAnimationFrame(loop);
      },
      stop: function () {
        if (!running) return;
        running = false; cancelAnimationFrame(raf); pausedAt = performance.now() / 1000;
      }
    };
  }
})();
