/* ==========================================================================
   fx.js: four AI visuals that change as you scroll.
     1. Neural network   signals travel through layers of weighted connections
     2. Attention        each word picks which other words matter
     3. Embedding space  similar ideas cluster; your cursor lights up neighbours
     4. Gradient descent a model walks downhill on a loss landscape
   Only Three.js is loaded. No images, models or other libraries.
   Edit SETTINGS to change colours or caption text.
   ========================================================================== */
(() => {
    'use strict';

    /* ---------- Settings ---------- */
    const SETTINGS = {
        colors: { bg: '#060a0c', fg: '#f1ede4', accent: '#ffb454', accent2: '#5fd1c4' },
        captions: [
            { tag: 'Neural network', text: 'Signals pass through layers of weighted connections' },
            { tag: 'Attention', text: 'Each word decides which other words matter' },
            { tag: 'Embeddings', text: 'Similar ideas end up close together. Move your cursor over them.' },
            { tag: 'Gradient descent', text: 'The model walks downhill toward fewer mistakes' }
        ],
        tokens: ['Offline', 'AI', 'that', 'runs', 'on', 'your', 'own', 'machine'],
        clusterNames: ['speech', 'language', 'robotics', 'therapy', 'memory'],
        cardMaxTiltDeg: 10
    };

    const THREE_URLS = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'
    ];

    /* ---------- Environment ---------- */
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const isMobile = () => window.innerWidth < 768;

    const cssVar = (name, fallback) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    SETTINGS.colors.bg = cssVar('--bg', SETTINGS.colors.bg);
    SETTINGS.colors.fg = cssVar('--fg', SETTINGS.colors.fg);
    SETTINGS.colors.accent = cssVar('--accent', SETTINGS.colors.accent);
    SETTINGS.colors.accent2 = cssVar('--accent-2', SETTINGS.colors.accent2);

    /* ---------- Canvas + HUD ---------- */
    let sky = document.getElementById('sky');
    if (!sky) {
        sky = document.createElement('canvas');
        sky.id = 'sky';
        sky.setAttribute('aria-hidden', 'true');
        document.body.prepend(sky);
    }

    const ring = document.createElement('button');
    ring.type = 'button';
    ring.className = 'fx-scroll-ring';
    ring.setAttribute('aria-label', 'Scroll down');
    ring.innerHTML =
        '<svg viewBox="0 0 56 56" aria-hidden="true">' +
        '<circle class="fx-scroll-ring-track" cx="28" cy="28" r="24"></circle>' +
        '<circle class="fx-scroll-ring-bar" cx="28" cy="28" r="24"></circle></svg>' +
        '<span class="fx-scroll-ring-label">0%</span>';
    document.body.appendChild(ring);
    const ringBar = ring.querySelector('.fx-scroll-ring-bar');
    const ringLabel = ring.querySelector('.fx-scroll-ring-label');
    const CIRC = 2 * Math.PI * 24;

    const caption = document.createElement('div');
    caption.className = 'fx-caption';
    caption.setAttribute('aria-hidden', 'true');
    caption.innerHTML =
        '<span class="fx-caption-tag"></span><span class="fx-caption-text"></span>' +
        '<span class="fx-caption-dots">' + SETTINGS.captions.map(() => '<i></i>').join('') + '</span>';
    document.body.appendChild(caption);
    const capTag = caption.querySelector('.fx-caption-tag');
    const capText = caption.querySelector('.fx-caption-text');
    const capDots = Array.from(caption.querySelectorAll('.fx-caption-dots i'));
    let capIndex = -1;

    function setCaption(i) {
        if (i === capIndex) return;
        capIndex = i;
        const c = SETTINGS.captions[i] || SETTINGS.captions[0];
        caption.classList.add('is-swapping');
        setTimeout(() => {
            capTag.textContent = c.tag;
            capText.textContent = c.text;
            capDots.forEach((d, k) => d.classList.toggle('on', k === i));
            caption.classList.remove('is-swapping');
        }, reduceMotion.matches ? 0 : 180);
    }

    const cursorDot = document.createElement('div');
    cursorDot.className = 'fx-cursor-dot';
    cursorDot.setAttribute('aria-hidden', 'true');
    const cursorRing = document.createElement('div');
    cursorRing.className = 'fx-cursor-ring';
    cursorRing.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorDot);
    document.body.appendChild(cursorRing);

    /* ---------- Interaction state ---------- */
    const pointer = { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, energy: 0, rx: -100, ry: -100, active: false };
    const fx = { hover: 0, hoverTarget: 0, burst: 0 };

    function scrollProgress() {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        return Math.min(1, Math.max(0, (window.scrollY || 0) / max));
    }

    function updateRing(p) {
        ringLabel.textContent = Math.round(p * 100) + '%';
        ringBar.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2);
    }

    ring.addEventListener('click', () => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const down = scrollProgress() < 0.9;
        window.scrollTo({
            top: down ? Math.min(max, window.scrollY + window.innerHeight * 0.85) : 0,
            behavior: reduceMotion.matches ? 'auto' : 'smooth'
        });
    });

    let activeCard = null;
    const resetCard = (c) => {
        if (c) ['--rx', '--ry', '--mx', '--my'].forEach((p) => c.style.removeProperty(p));
    };

    function onPointer(x, y, target) {
        const px = pointer.nx, py = pointer.ny;
        pointer.x = x;
        pointer.y = y;
        pointer.nx = (x / Math.max(1, window.innerWidth)) * 2 - 1;
        pointer.ny = -(y / Math.max(1, window.innerHeight)) * 2 + 1;
        pointer.energy = Math.min(1.5, pointer.energy + Math.hypot(pointer.nx - px, pointer.ny - py) * 3);
        pointer.active = true;

        if (finePointer.matches && !reduceMotion.matches) {
            cursorDot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        }
        if (!target || !target.closest) return;

        cursorRing.classList.toggle('is-hover', Boolean(target.closest('a, button, .card, .chips li')));
        fx.hoverTarget = target.closest('.card, .chips li') ? 1 : 0;

        const card = target.closest('.card');
        if (card !== activeCard) {
            resetCard(activeCard);
            activeCard = card;
        }
        if (card && finePointer.matches && !reduceMotion.matches) {
            const r = card.getBoundingClientRect();
            const u = Math.min(1, Math.max(0, (x - r.left) / Math.max(1, r.width)));
            const v = Math.min(1, Math.max(0, (y - r.top) / Math.max(1, r.height)));
            card.style.setProperty('--ry', ((u - 0.5) * 2 * SETTINGS.cardMaxTiltDeg).toFixed(2) + 'deg');
            card.style.setProperty('--rx', ((0.5 - v) * 2 * SETTINGS.cardMaxTiltDeg).toFixed(2) + 'deg');
            card.style.setProperty('--mx', (u * 100).toFixed(1) + '%');
            card.style.setProperty('--my', (v * 100).toFixed(1) + '%');
        }
    }

    window.addEventListener('pointermove', (e) => onPointer(e.clientX, e.clientY, e.target), { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
        pointer.active = false;
        fx.hoverTarget = 0;
        resetCard(activeCard);
        activeCard = null;
        cursorRing.classList.remove('is-hover');
    });
    window.addEventListener('scroll', () => updateRing(scrollProgress()), { passive: true });
    window.addEventListener('click', (e) => {
        if (reduceMotion.matches) return;
        if (e.target.closest && e.target.closest('a, button, input, textarea, select')) return;
        fx.burst = 1;
    });
    updateRing(scrollProgress());
    setCaption(0);

    /* ---------- Script loader ---------- */
    function loadScript(url, timeoutMs) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            const timer = setTimeout(() => { s.remove(); reject(new Error('timeout')); }, timeoutMs);
            s.onload = () => { clearTimeout(timer); resolve(); };
            s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('error')); };
            document.head.appendChild(s);
        });
    }

    async function loadThree() {
        if (window.THREE) return true;
        for (const url of THREE_URLS) {
            try {
                await loadScript(url, 6000);
                if (window.THREE) return true;
            } catch (_) { /* try next mirror */ }
        }
        return false;
    }

    /* ======================================================================
       3D SCENE
       ====================================================================== */
    function initScene() {
        const THREE = window.THREE;
        const mobile = isMobile();
        const C = SETTINGS.colors;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas: sky, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
        } catch (_) {
            return; // no WebGL: the CSS background stays
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setClearColor(new THREE.Color(C.bg), 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 100);

        const amber = new THREE.Color(C.accent);
        const teal = new THREE.Color(C.accent2);
        const cream = new THREE.Color(C.fg);

        // Soft round sprite shared by every glowing point
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = spriteCanvas.height = 64;
        const sctx = spriteCanvas.getContext('2d');
        const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 64, 64);
        const sprite = new THREE.CanvasTexture(spriteCanvas);

        const glowMat = (size, opacity, vertexColors, color) =>
            new THREE.PointsMaterial({
                color: color || 0xffffff, size: size, map: sprite, transparent: true, opacity: opacity,
                depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: !!vertexColors
            });
        const lineMat = (opacity, vertexColors, color) =>
            new THREE.LineBasicMaterial({
                color: color || 0xffffff, transparent: true, opacity: opacity,
                depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: !!vertexColors
            });

        function makeLabel(text, widthUnits, strong) {
            const w = 256, h = 96;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const x = c.getContext('2d');
            const r = 28, pad = 6;
            x.beginPath();
            x.moveTo(pad + r, pad);
            x.arcTo(w - pad, pad, w - pad, h - pad, r);
            x.arcTo(w - pad, h - pad, pad, h - pad, r);
            x.arcTo(pad, h - pad, pad, pad, r);
            x.arcTo(pad, pad, w - pad, pad, r);
            x.closePath();
            x.fillStyle = strong ? 'rgba(255,180,84,0.16)' : 'rgba(241,237,228,0.08)';
            x.fill();
            x.lineWidth = 3;
            x.strokeStyle = strong ? 'rgba(255,180,84,0.8)' : 'rgba(241,237,228,0.3)';
            x.stroke();
            x.font = '600 42px "Hanken Grotesk", system-ui, sans-serif';
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.fillStyle = '#f1ede4';
            x.fillText(text, w / 2, h / 2 + 2);
            const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
            const spr = new THREE.Sprite(mat);
            spr.scale.set(widthUnits, widthUnits * h / w, 1);
            spr.userData.baseScale = spr.scale.clone();
            return spr;
        }

        const root = new THREE.Group();
        scene.add(root);

        // Each visual fades in and out with scroll; faders keeps their materials
        const groups = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
        groups.forEach((g) => root.add(g));
        const faders = [];
        const fade = (k, mat, base) => { faders.push({ k: k, mat: mat, base: base }); return mat; };

        /* ---- Background dust ---- */
        const dustN = mobile ? 200 : 420;
        const dustArr = new Float32Array(dustN * 3);
        for (let i = 0; i < dustN; i++) {
            dustArr[i * 3] = (Math.random() - 0.5) * 34;
            dustArr[i * 3 + 1] = (Math.random() - 0.5) * 20;
            dustArr[i * 3 + 2] = -12 + Math.random() * 16;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustArr, 3));
        const dust = new THREE.Points(dustGeo, glowMat(0.13, 0.4, false, 0x9fd8d0));
        scene.add(dust);

        /* ==== 1. NEURAL NETWORK ==== */
        const net = groups[0];
        const layers = mobile ? [4, 6, 7, 6, 3] : [5, 8, 9, 8, 4];
        const nodes = [];
        const layerOf = [];
        layers.forEach((n, L) => {
            for (let i = 0; i < n; i++) {
                nodes.push(new THREE.Vector3(
                    (L - (layers.length - 1) / 2) * 2.6,
                    (i - (n - 1) / 2) * 1.12,
                    Math.sin(i * 1.7 + L * 1.3) * 1.1
                ));
                layerOf.push(L);
            }
        });

        const conns = [];
        for (let a = 0; a < nodes.length; a++) {
            for (let b = 0; b < nodes.length; b++) {
                if (layerOf[b] === layerOf[a] + 1) conns.push([a, b]);
            }
        }
        const connPos = new Float32Array(conns.length * 6);
        const connCol = new Float32Array(conns.length * 6);
        conns.forEach((cn, i) => {
            const A = nodes[cn[0]], B = nodes[cn[1]];
            connPos.set([A.x, A.y, A.z, B.x, B.y, B.z], i * 6);
            const wgt = 0.2 + Math.random() * 0.8; // "weight" shown as brightness
            for (let k = 0; k < 2; k++) {
                connCol[i * 6 + k * 3] = teal.r * wgt;
                connCol[i * 6 + k * 3 + 1] = teal.g * wgt;
                connCol[i * 6 + k * 3 + 2] = teal.b * wgt;
            }
        });
        const connGeo = new THREE.BufferGeometry();
        connGeo.setAttribute('position', new THREE.BufferAttribute(connPos, 3));
        connGeo.setAttribute('color', new THREE.BufferAttribute(connCol, 3));
        net.add(new THREE.LineSegments(connGeo, fade(0, lineMat(0.5, true), 0.5)));

        const nodePos = new Float32Array(nodes.length * 3);
        nodes.forEach((n, i) => nodePos.set([n.x, n.y, n.z], i * 3));
        const nodeCol = new Float32Array(nodes.length * 3);
        const act = new Float32Array(nodes.length);
        const nodeGeo = new THREE.BufferGeometry();
        nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
        nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
        net.add(new THREE.Points(nodeGeo, fade(0, glowMat(0.62, 1, true), 1)));

        const pulseN = mobile ? 70 : 150;
        const pulses = [];
        for (let i = 0; i < pulseN; i++) {
            pulses.push({ c: Math.floor(Math.random() * conns.length), u: Math.random(), s: 0.25 + Math.random() * 0.35 });
        }
        const pulsePos = new Float32Array(pulseN * 3);
        const pulseGeo = new THREE.BufferGeometry();
        pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
        net.add(new THREE.Points(pulseGeo, fade(0, glowMat(0.3, 1, false, amber), 1)));

        /* ==== 2. ATTENTION ==== */
        const att = groups[1];
        const tokens = SETTINGS.tokens;
        const tokenSpacing = mobile ? 1.35 : 1.45;
        const tokenSprites = tokens.map((word, i) => {
            const spr = makeLabel(word, 1.38, false);
            spr.position.set((i - (tokens.length - 1) / 2) * tokenSpacing, 0, 0);
            att.add(spr);
            fade(1, spr.material, 1);
            return spr;
        });

        const ARC_PTS = 28;
        const arcs = tokens.map(() => {
            const pos = new Float32Array(ARC_PTS * 3);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const mat = fade(1, lineMat(0, false, amber), 0);
            const line = new THREE.Line(geo, mat);
            att.add(line);
            return { geo: geo, pos: pos, mat: mat, fader: faders[faders.length - 1], cur: 0, target: 0 };
        });
        let queryIdx = -1;

        function setQuery(q) {
            if (q === queryIdx) return;
            queryIdx = q;
            const xq = tokenSprites[q].position.x;
            let maxW = 0;
            const raw = tokens.map((_, j) => {
                if (j === q) return 0;
                const wv = Math.exp(-Math.abs(j - q) * 0.45 + Math.sin(j * 2.3 + q * 1.7) * 0.9);
                maxW = Math.max(maxW, wv);
                return wv;
            });
            arcs.forEach((arc, j) => {
                arc.target = j === q ? 0 : raw[j] / maxW;
                const xj = tokenSprites[j].position.x;
                const dx = Math.abs(xj - xq);
                for (let s = 0; s < ARC_PTS; s++) {
                    const u = s / (ARC_PTS - 1);
                    arc.pos[s * 3] = xq + (xj - xq) * u;
                    arc.pos[s * 3 + 1] = 0.45 + Math.sin(u * Math.PI) * (0.5 + dx * 0.3);
                    arc.pos[s * 3 + 2] = 0;
                }
                arc.geo.attributes.position.needsUpdate = true;
            });
        }
        setQuery(3);

        /* ==== 3. EMBEDDING SPACE ==== */
        const emb = groups[2];
        const K = 5;
        const perCluster = mobile ? 90 : 170;
        const clusterColors = [teal, amber, new THREE.Color('#7fa8ff'), new THREE.Color('#ff7f6e'), new THREE.Color('#e9e2cf')];
        const centers = [];
        for (let k = 0; k < K; k++) {
            const a = (k / K) * Math.PI * 2 + 0.4;
            centers.push(new THREE.Vector3(Math.cos(a) * 3.3, (Math.random() - 0.5) * 3.4, Math.sin(a) * 3.3));
        }
        const embN = K * perCluster;
        const embPos = new Float32Array(embN * 3);
        const embBase = new Float32Array(embN * 3);
        const embCol = new Float32Array(embN * 3);
        for (let k = 0; k < K; k++) {
            for (let i = 0; i < perCluster; i++) {
                const idx = k * perCluster + i;
                const gx = (Math.random() + Math.random() + Math.random() - 1.5) * 1.1;
                const gy = (Math.random() + Math.random() + Math.random() - 1.5) * 1.1;
                const gz = (Math.random() + Math.random() + Math.random() - 1.5) * 1.1;
                embPos.set([centers[k].x + gx, centers[k].y + gy, centers[k].z + gz], idx * 3);
                embBase.set([clusterColors[k].r, clusterColors[k].g, clusterColors[k].b], idx * 3);
            }
        }
        embCol.set(embBase);
        const embGeo = new THREE.BufferGeometry();
        embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
        embGeo.setAttribute('color', new THREE.BufferAttribute(embCol, 3));
        emb.add(new THREE.Points(embGeo, fade(2, glowMat(0.34, 0.95, true), 0.95)));

        SETTINGS.clusterNames.slice(0, K).forEach((name, k) => {
            const lab = makeLabel(name, 1.5, true);
            lab.position.set(centers[k].x, centers[k].y + 1.5, centers[k].z);
            emb.add(lab);
            fade(2, lab.material, 1);
        });
        const projV = new THREE.Vector3();

        /* ==== 4. GRADIENT DESCENT ==== */
        const gd = groups[3];
        const N = mobile ? 28 : 38;
        const SIZE = 12;
        const hFn = (x, z) => 0.55 * Math.sin(0.8 * x) * Math.cos(0.8 * z) + 0.04 * (x * x + z * z) - 0.2;
        let hMin = 1e9, hMax = -1e9;
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
                const hv = hFn(-SIZE / 2 + (SIZE * i) / N, -SIZE / 2 + (SIZE * j) / N);
                hMin = Math.min(hMin, hv);
                hMax = Math.max(hMax, hv);
            }
        }
        const segCount = 2 * (N + 1) * N;
        const gridPos = new Float32Array(segCount * 6);
        const gridCol = new Float32Array(segCount * 6);
        let gp = 0;
        function pushVertex(x, z) {
            const hv = hFn(x, z);
            const m = (hv - hMin) / (hMax - hMin);
            gridPos[gp * 3] = x;
            gridPos[gp * 3 + 1] = hv;
            gridPos[gp * 3 + 2] = z;
            const dim = 0.35 + 0.65 * (1 - m);
            gridCol[gp * 3] = (teal.r * (1 - m) + amber.r * m) * dim;
            gridCol[gp * 3 + 1] = (teal.g * (1 - m) + amber.g * m) * dim;
            gridCol[gp * 3 + 2] = (teal.b * (1 - m) + amber.b * m) * dim;
            gp++;
        }
        for (let i = 0; i <= N; i++) {
            const a = -SIZE / 2 + (SIZE * i) / N;
            for (let j = 0; j < N; j++) {
                const b0 = -SIZE / 2 + (SIZE * j) / N;
                const b1 = -SIZE / 2 + (SIZE * (j + 1)) / N;
                pushVertex(b0, a); pushVertex(b1, a); // line along x
                pushVertex(a, b0); pushVertex(a, b1); // line along z
            }
        }
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
        gridGeo.setAttribute('color', new THREE.BufferAttribute(gridCol, 3));
        gd.add(new THREE.LineSegments(gridGeo, fade(3, lineMat(0.7, true), 0.7)));

        // Real gradient descent with momentum on the same surface
        const STEPS = 150;
        const path = [];
        let px = -4.6, pz = 3.9, vx = 0, vz = 0;
        for (let s = 0; s < STEPS; s++) {
            path.push(new THREE.Vector3(px, hFn(px, pz) + 0.12, pz));
            const gx = 0.44 * Math.cos(0.8 * px) * Math.cos(0.8 * pz) + 0.08 * px;
            const gz = -0.44 * Math.sin(0.8 * px) * Math.sin(0.8 * pz) + 0.08 * pz;
            vx = 0.88 * vx - 0.13 * gx;
            vz = 0.88 * vz - 0.13 * gz;
            px += vx;
            pz += vz;
        }
        const trailArr = new Float32Array(STEPS * 3);
        path.forEach((v, i) => trailArr.set([v.x, v.y, v.z], i * 3));
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
        trailGeo.setDrawRange(0, 0);
        gd.add(new THREE.Line(trailGeo, fade(3, lineMat(1, false, amber), 1)));

        const ballArr = new Float32Array(3);
        const ballGeo = new THREE.BufferGeometry();
        ballGeo.setAttribute('position', new THREE.BufferAttribute(ballArr, 3));
        gd.add(new THREE.Points(ballGeo, fade(3, glowMat(1.1, 1, false, 0xffe2b0), 1)));

        gd.rotation.x = 0.5;
        gd.position.y = -0.4;

        /* ---- Layout: scene on the right on desktop, above the text on mobile ---- */
        let baseScale = 1;
        function layout() {
            const m = isMobile();
            if (m) {
                root.position.set(0, 2.6, 0);
                baseScale = 0.62;
                camera.position.set(0, 0, 16);
            } else {
                root.position.set(3.4, 0, 0);
                baseScale = 1;
                camera.position.set(0, 0, 15);
            }
            camera.lookAt(0, 0, 0);
        }
        layout();

        let smoothProg = scrollProgress();

        function render(now) {
            const t = now * 0.001;
            const moving = !reduceMotion.matches;

            pointer.sx += (pointer.nx - pointer.sx) * 0.07;
            pointer.sy += (pointer.ny - pointer.sy) * 0.07;
            pointer.energy *= 0.93;
            fx.burst *= 0.92;
            fx.hover += (fx.hoverTarget - fx.hover) * 0.08;
            const excite = Math.min(1.6, fx.hover * 0.8 + pointer.energy * 0.5);

            if (finePointer.matches && moving && pointer.active) {
                pointer.rx += (pointer.x - pointer.rx) * 0.22;
                pointer.ry += (pointer.y - pointer.ry) * 0.22;
                cursorRing.style.transform = 'translate3d(' + pointer.rx.toFixed(1) + 'px,' + pointer.ry.toFixed(1) + 'px,0)';
            }

            smoothProg += (scrollProgress() - smoothProg) * (moving ? 0.08 : 1);
            const stage = smoothProg * 3;
            setCaption(Math.min(3, Math.round(stage)));

            // Scroll weights: one visual at a time, smooth cross-fade
            const w = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
                const lin = Math.max(0, Math.min(1, 1 - Math.abs(stage - k) * 1.25));
                w[k] = lin * lin * (3 - 2 * lin);
                groups[k].visible = w[k] > 0.01;
                groups[k].scale.setScalar(0.9 + 0.1 * w[k]);
            }
            for (let i = 0; i < faders.length; i++) {
                const fd = faders[i];
                fd.mat.opacity = fd.base * w[fd.k];
            }

            root.rotation.y = pointer.sx * 0.35 + Math.sin(t * 0.15) * 0.1;
            root.rotation.x = -pointer.sy * 0.18;
            root.scale.setScalar(baseScale * (1 + fx.burst * 0.05));
            dust.rotation.y = t * 0.012;
            dust.position.x = -pointer.sx * 0.5;
            dust.position.y = -pointer.sy * 0.3;

            // 1. Network: pulses race along connections and light the nodes they reach
            if (w[0] > 0.01) {
                const speed = (moving ? 1 : 0) * (1 + excite * 1.2);
                const pp = pulseGeo.attributes.position.array;
                for (let i = 0; i < pulseN; i++) {
                    const p = pulses[i];
                    p.u += (moving ? 0.016 : 0) * p.s * speed * 3;
                    if (p.u >= 1) {
                        act[conns[p.c][1]] = 1;
                        p.c = Math.floor(Math.random() * conns.length);
                        p.u = 0;
                    }
                    const A = nodes[conns[p.c][0]], B = nodes[conns[p.c][1]];
                    pp[i * 3] = A.x + (B.x - A.x) * p.u;
                    pp[i * 3 + 1] = A.y + (B.y - A.y) * p.u;
                    pp[i * 3 + 2] = A.z + (B.z - A.z) * p.u;
                }
                pulseGeo.attributes.position.needsUpdate = true;

                const nc = nodeGeo.attributes.color.array;
                for (let i = 0; i < nodes.length; i++) {
                    act[i] *= 0.94;
                    const a = act[i];
                    const lum = 0.55 + a * 1.1;
                    nc[i * 3] = (teal.r * (1 - a) + amber.r * a) * lum;
                    nc[i * 3 + 1] = (teal.g * (1 - a) + amber.g * a) * lum;
                    nc[i * 3 + 2] = (teal.b * (1 - a) + amber.b * a) * lum;
                }
                nodeGeo.attributes.color.needsUpdate = true;
                net.rotation.y = Math.sin(t * 0.25) * 0.18;
            }

            // 2. Attention: the "query" word moves every couple of seconds
            if (w[1] > 0.01) {
                setQuery(moving ? Math.floor(t / 2.4) % tokens.length : 3);
                for (let j = 0; j < tokens.length; j++) {
                    const arc = arcs[j];
                    arc.cur += (arc.target - arc.cur) * 0.08;
                    arc.fader.base = arc.cur * 0.95;
                    const spr = tokenSprites[j];
                    const isQ = j === queryIdx;
                    const sc = isQ ? 1.18 : 1 + arc.cur * 0.06;
                    spr.scale.x += (spr.userData.baseScale.x * sc - spr.scale.x) * 0.15;
                    spr.scale.y += (spr.userData.baseScale.y * sc - spr.scale.y) * 0.15;
                    spr.position.y += (((isQ ? 0.18 : 0) - spr.position.y) * 0.15);
                }
            }

            // 3. Embeddings: points near the cursor light up
            if (w[2] > 0.01) {
                emb.rotation.y = t * 0.12 * (1 + excite);
                emb.updateMatrixWorld(true);
                const ec = embGeo.attributes.color.array;
                const useCursor = pointer.active && finePointer.matches;
                for (let i = 0; i < embN; i++) {
                    let near = 0;
                    if (useCursor) {
                        projV.set(embPos[i * 3], embPos[i * 3 + 1], embPos[i * 3 + 2]).applyMatrix4(emb.matrixWorld).project(camera);
                        near = Math.max(0, 1 - Math.hypot(projV.x - pointer.nx, projV.y - pointer.ny) / 0.22);
                    }
                    const lum = 0.6 + near * 1.8;
                    ec[i * 3] = embBase[i * 3] * lum + near * 0.3;
                    ec[i * 3 + 1] = embBase[i * 3 + 1] * lum + near * 0.3;
                    ec[i * 3 + 2] = embBase[i * 3 + 2] * lum + near * 0.3;
                }
                embGeo.attributes.color.needsUpdate = true;
            }

            // 4. Gradient descent: a ball walks the real optimisation path, then restarts
            if (w[3] > 0.01) {
                const cycle = STEPS + 45;
                const idxF = moving ? (t * (22 + excite * 18)) % cycle : STEPS - 1;
                const idx = Math.min(STEPS - 1, Math.floor(idxF));
                const nxt = Math.min(STEPS - 1, idx + 1);
                const fr = Math.min(1, idxF - idx);
                const a = path[idx], b = path[nxt];
                ballArr[0] = a.x + (b.x - a.x) * fr;
                ballArr[1] = a.y + (b.y - a.y) * fr;
                ballArr[2] = a.z + (b.z - a.z) * fr;
                ballGeo.attributes.position.needsUpdate = true;
                trailGeo.setDrawRange(0, idxF >= STEPS ? 0 : idx + 1);
                gd.rotation.y = Math.sin(t * 0.2) * 0.35;
            }

            renderer.render(scene, camera);
        }

        let raf = 0;
        function loop(now) {
            render(now);
            raf = requestAnimationFrame(loop);
        }
        function startOrPause() {
            cancelAnimationFrame(raf);
            if (document.hidden) return;
            if (reduceMotion.matches) {
                render(0);
                return;
            }
            raf = requestAnimationFrame(loop);
        }

        let resizeTimer = 0;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
                renderer.setSize(window.innerWidth, window.innerHeight, false);
                camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
                camera.updateProjectionMatrix();
                layout();
                if (reduceMotion.matches) render(0);
            }, 120);
        });
        window.addEventListener('scroll', () => {
            if (reduceMotion.matches && !document.hidden) render(0);
        }, { passive: true });
        document.addEventListener('visibilitychange', startOrPause);
        reduceMotion.addEventListener('change', startOrPause);

        render(performance.now());
        sky.classList.add('is-ready');
        startOrPause();
    }

    loadThree().then((ok) => {
        if (ok) initScene();
    });
})();
