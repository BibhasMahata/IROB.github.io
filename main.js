/* ═══════════════════════════════════════════════════════════════════════════
   IROB — main.js  ·  Platform Engine v1.0
   Deps (loaded before this file): THREE r128, GSAP 3 + ScrollTrigger, Lenis, data.js
   Author: IROB Build Team
═══════════════════════════════════════════════════════════════════════════ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════════════════════════════
     1.  CINEMATIC LOADER — injected dynamically, dismissed after 2.8s
  ═══════════════════════════════════════════════════════════════════ */
  function initLoader() {
    const el = document.createElement('div');
    el.id = 'loader';
    el.innerHTML = `
      <div class="loader-title" data-text="IROB">IROB</div>
      <div class="loader-sub">The Internet's Final Platform</div>
      <div class="loader-bar-wrap">
        <div class="loader-bar-track">
          <div class="loader-bar-fill" id="loader-fill"></div>
        </div>
        <div class="loader-status">
          <span id="loader-msg">INITIALIZING SYSTEMS</span>
          <span class="pct" id="loader-pct">0%</span>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Staged progress counter
    const msgs = [
      [42,  700, 'LOADING MEDIA DATABASE'],
      [67,  500, 'COMPILING PHASE DATA'],
      [88,  600, 'RENDERING NETWORK LAYER'],
      [100, 700, 'SYSTEM READY'],
    ];
    const pctEl = document.getElementById('loader-pct');
    const msgEl = document.getElementById('loader-msg');
    let current = 0;

    function runStage(idx) {
      if (idx >= msgs.length) return;
      const [to, dur, label] = msgs[idx];
      const from = idx === 0 ? 0 : msgs[idx - 1][0];
      if (msgEl) msgEl.textContent = label;
      const start = performance.now();
      (function tick(now) {
        const t    = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 2);
        const pct  = Math.round(from + (to - from) * ease);
        if (pctEl) pctEl.textContent = pct + '%';
        if (t < 1) requestAnimationFrame(tick);
        else       runStage(idx + 1);
      })(performance.now());
    }
    runStage(0);

    // Dismiss
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 700);
    }, 2800);
  }

  initLoader();


  /* ═══════════════════════════════════════════════════════════════════
     2.  LENIS SMOOTH SCROLL
  ═══════════════════════════════════════════════════════════════════ */
  let lenis = null;
  try {
    lenis = new Lenis({
      duration:     1.25,
      easing:       t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smooth:       true,
      smoothTouch:  false,
    });
    (function rafLoop(t) { lenis.raf(t); requestAnimationFrame(rafLoop); })(0);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } catch (e) {
    console.warn('[IROB] Lenis unavailable — using native scroll.');
  }


  /* ═══════════════════════════════════════════════════════════════════
     3.  THREE.JS BACKGROUND — mouse-reactive particle network
     ─────────────────────────────────────────────────────────────────
     PERFORMANCE CHANGES (all in this block):
     ① mousemove listener only stores two numbers — zero math, zero
       DOM access.  { passive: true } tells the browser it can scroll
       without waiting for the handler to return (eliminates jank).
     ② ALL camera-angle math lives inside the RAF tick().  No matter
       how many mousemove events fire between frames (could be 60+),
       the lerp runs exactly once — when the browser is ready to paint.
     ③ Edge culling switched from Math.sqrt to squared-distance
       comparison.  Saves ~12,720 sqrt() calls per rebuild pass.
     ④ Edge rebuild every 3rd frame instead of every 2nd — the
       60fps visual is indistinguishable but the O(N²) cost drops.
     ⑤ Outer-loop coords hoisted out of the inner-loop to avoid
       repeated typed-array reads (outer particle accessed once).
  ═══════════════════════════════════════════════════════════════════ */
  (function initGL() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    camera.position.z = 48;

    // ── ① Mouse tracking — write-only in the event, read-only in RAF ──
    // rawMouseX/Y : written by the event listener (2 assignments, nothing else).
    // camDstX/Y   : lerp accumulators, updated ONCE per RAF frame in tick().
    // This is the "RAF gate": even if 120 mousemove events fire between two
    // animation frames, the camera angle is recalculated exactly ONCE —
    // the moment the GPU is ready to draw the next frame.
    let rawMouseX = 0, rawMouseY = 0;
    let camDstX   = 0, camDstY   = 0;
    window.addEventListener('mousemove', e => {
      // Only two cheap assignments — no trig, no DOM reads, no style writes.
      rawMouseX =  (e.clientX / innerWidth  - 0.5) * 2;
      rawMouseY = -(e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true }); // passive: true removes the scroll-blocking penalty

    // ── Main particle field (160 dots) ──
    const N   = 160;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 100;
      pos[i*3+1] = (Math.random() - 0.5) * 100;
      pos[i*3+2] = (Math.random() - 0.5) * 30;
      vel.push({ x: (Math.random()-0.5)*0.034, y: (Math.random()-0.5)*0.034 });
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0xc0001a, size: 0.40, transparent: true, opacity: 0.82 });
    scene.add(new THREE.Points(pGeo, pMat));

    // ── Accent sparks (22 bright) ──
    const aN   = 22;
    const aPos = new Float32Array(aN * 3);
    for (let i = 0; i < aN; i++) {
      aPos[i*3]   = (Math.random()-0.5)*88;
      aPos[i*3+1] = (Math.random()-0.5)*88;
      aPos[i*3+2] = (Math.random()-0.5)*18;
    }
    const aGeo = new THREE.BufferGeometry();
    aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
    scene.add(new THREE.Points(aGeo, new THREE.PointsMaterial({ color:0xff2040, size:1.18, transparent:true, opacity:0.48 })));

    // ── Connection lines ──
    const MAX_SEG = N * 10;
    const lPos    = new Float32Array(MAX_SEG * 6);
    const lGeo    = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lGeo.setDrawRange(0, 0);
    scene.add(new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ color:0xc0001a, transparent:true, opacity:0.09 })));

    // ── Decorative torus rings ──
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(18, 0.07, 8, 130),
      new THREE.MeshBasicMaterial({ color:0xc0001a, transparent:true, opacity:0.05 })
    );
    ring1.rotation.x = Math.PI / 4;
    scene.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(30, 0.04, 8, 180),
      new THREE.MeshBasicMaterial({ color:0xc0001a, transparent:true, opacity:0.025 })
    );
    ring2.rotation.x = -Math.PI / 5;
    ring2.rotation.y =  Math.PI / 4;
    scene.add(ring2);

    const THRESH    = 14;
    const THRESH_SQ = THRESH * THRESH; // ③ pre-computed — no sqrt in the inner loop
    let   frame  = 0;

    function tick() {
      requestAnimationFrame(tick);
      frame++;

      // ── ② RAF gate: mouse → camera.
      // This is the ONLY place camDstX/Y are touched.  It runs exactly once
      // per frame regardless of how many mousemove events fired since the
      // last paint — zero wasted work between frames.
      camDstX += (rawMouseX * 3.8 - camDstX) * 0.04;
      camDstY += (rawMouseY * 2.4 - camDstY) * 0.04;
      camera.position.x = Math.sin(frame * 0.0024) * 2.4 + camDstX;
      camera.position.y = Math.cos(frame * 0.0017) * 1.7 + camDstY;
      camera.lookAt(0, 0, 0);

      // Rotate rings
      ring1.rotation.z += 0.0017;
      ring2.rotation.z -= 0.0010;
      ring2.rotation.y += 0.0005;

      // Move particles + wraparound
      for (let i = 0; i < N; i++) {
        pos[i*3]   += vel[i].x;
        pos[i*3+1] += vel[i].y;
        if (pos[i*3]   >  52) pos[i*3]   = -52;
        if (pos[i*3]   < -52) pos[i*3]   =  52;
        if (pos[i*3+1] >  52) pos[i*3+1] = -52;
        if (pos[i*3+1] < -52) pos[i*3+1] =  52;
      }
      pGeo.attributes.position.needsUpdate = true;

      // ── ③④⑤ Rebuild edges: every 3rd frame, sqrt-free, hoisted outer reads
      // BEFORE: Math.sqrt(dx*dx+dy*dy) < 14  →  12,720 sqrt calls per pass
      // AFTER:  dx*dx + dy*dy < 196           →  0 sqrt calls
      // Outer coords (ix,iy,iz) read once and reused across the inner loop.
      if (frame % 3 === 0) {
        let seg = 0;
        for (let i = 0; i < N && seg < MAX_SEG - 1; i++) {
          const ix = pos[i*3];
          const iy = pos[i*3 + 1];
          const iz = pos[i*3 + 2];
          for (let j = i + 1; j < N && seg < MAX_SEG - 1; j++) {
            const dx = ix - pos[j*3];
            const dy = iy - pos[j*3 + 1];
            if (dx*dx + dy*dy < THRESH_SQ) {
              const b = seg * 6;
              lPos[b]   = ix;          lPos[b+1] = iy;          lPos[b+2] = iz;
              lPos[b+3] = pos[j*3];   lPos[b+4] = pos[j*3+1];  lPos[b+5] = pos[j*3+2];
              seg++;
            }
          }
        }
        lGeo.setDrawRange(0, seg * 2);
        lGeo.attributes.position.needsUpdate = true;
      }
      renderer.render(scene, camera);
    }
    tick();

    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  })();


  /* ═══════════════════════════════════════════════════════════════════
     4.  GSAP + ScrollTrigger setup
  ═══════════════════════════════════════════════════════════════════ */
  gsap.registerPlugin(ScrollTrigger);
  if (lenis) lenis.on('scroll', ScrollTrigger.update);


  /* ═══════════════════════════════════════════════════════════════════
     5.  CUSTOM CURSOR
     ─────────────────────────────────────────────────────────────────
     PERFORMANCE CHANGE: the ring follower used setTimeout(fn, 90)
     inside the raw mousemove event — queues macrotasks 60+ times per
     second outside the RAF budget.  Replaced with a single RAF loop
     that lerps the ring toward the dot: zero timer overhead, silky lag.
  ═══════════════════════════════════════════════════════════════════ */
  const $cur  = document.getElementById('cursor');
  const $ring = document.getElementById('cursor-ring');
  if ($cur && $ring) {
    let dotX = 0, dotY = 0;   // raw pointer — written in event, read in RAF
    let ringX = 0, ringY = 0; // lerped ring position, applied in RAF

    document.addEventListener('mousemove', e => {
      dotX = e.clientX;
      dotY = e.clientY;
    }, { passive: true });

    // One shared RAF loop drives both elements — zero setTimeout overhead
    (function cursorLoop() {
      requestAnimationFrame(cursorLoop);
      $cur.style.left  = dotX + 'px';
      $cur.style.top   = dotY + 'px';
      ringX += (dotX - ringX) * 0.14;
      ringY += (dotY - ringY) * 0.14;
      $ring.style.left = ringX + 'px';
      $ring.style.top  = ringY + 'px';
    })();
    function bindCursor(sel) {
      document.querySelectorAll(sel).forEach(el => {
        el.addEventListener('mouseenter', () => {
          $cur.style.width = $cur.style.height = '18px';
          $ring.style.width = $ring.style.height = '52px';
        });
        el.addEventListener('mouseleave', () => {
          $cur.style.width = $cur.style.height = '10px';
          $ring.style.width = $ring.style.height = '34px';
        });
      });
    }
    bindCursor('a,button,.hover-target,.phase-card,.phase-node,.tech-cell,.rev-cell');
  }


  /* ═══════════════════════════════════════════════════════════════════
     6.  HERO STAT COUNTERS — GSAP countUp, preserves inner child spans
  ═══════════════════════════════════════════════════════════════════ */
  function countUp(elId, target, decimals, delayS) {
    const el = document.getElementById(elId);
    if (!el) return;
    const childSpan = el.querySelector('span') ? el.querySelector('span').outerHTML : '';
    const fmt = v => (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString());
    const obj = { v: 0 };
    gsap.to(obj, {
      v:        target,
      duration: 2.4,
      ease:     'power3.out',
      delay:    delayS,
      onUpdate() { el.innerHTML = fmt(obj.v) + childSpan; },
      onComplete() { el.innerHTML = fmt(target) + childSpan; },
    });
  }

  // Targets: phases=8, features=50+, revenue=9, score=9.1
  countUp('s-phases',  8,   0, 3.3);
  countUp('s-features',50,  0, 3.5);
  countUp('s-revenue', 9,   0, 3.7);
  countUp('s-score',   9.1, 1, 3.9);


  /* ═══════════════════════════════════════════════════════════════════
     7.  BUILD TIMELINE — phase cards from PHASES (data.js)
  ═══════════════════════════════════════════════════════════════════ */
  function buildTimeline() {
    const container = document.getElementById('timeline-rows');
    if (!container || typeof PHASES === 'undefined') return;

    PHASES.forEach((ph, i) => {
      const isLeft    = i % 2 === 0;
      const statusCls = ph.status === 'IN DEVELOPMENT' ? 's-dev' : 's-plan';
      const tagsHTML  = ph.features.slice(0, 5).map(f => `<span class="ph-tag">${f}</span>`).join('');

      const row  = document.createElement('div');
      row.className = 'phase-row';

      const card = `
        <div class="phase-card hover-target" data-phase="${ph.id}">
          <div class="ph-bg-num">${String(ph.id).padStart(2,'0')}</div>
          <div class="ph-code">${ph.code}</div>
          <div class="ph-name">${ph.icon}  ${ph.title}</div>
          <div class="ph-rep">Replaces: <span>${ph.replaces}</span></div>
          <p class="ph-desc">${ph.description}</p>
          <div class="ph-tags">${tagsHTML}</div>
          <div class="ph-footer">
            <span class="ph-time">⏱ ${ph.timeline}</span>
            <span class="ph-status ${statusCls}">${ph.status}</span>
          </div>
        </div>`;

      const node  = `<div class="phase-node hover-target" data-phase="${ph.id}" style="grid-column:2">${String(ph.id).padStart(2,'0')}</div>`;
      const empty = `<div class="ph-empty"></div>`;

      row.innerHTML = isLeft ? card + node + empty : empty + node + card;
      container.appendChild(row);
    });

    // ScrollTrigger — alternate slide-in from each side
    document.querySelectorAll('.phase-row').forEach((row, i) => {
      gsap.fromTo(row,
        { opacity:0, x: i%2===0 ? -58 : 58 },
        {
          opacity:1, x:0, duration:0.82, ease:'power3.out',
          scrollTrigger: {
            trigger: row,
            start:   'top 86%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    // Wire all [data-phase] elements to openModal
    document.querySelectorAll('[data-phase]').forEach(el => {
      el.addEventListener('click', () => openModal(Number(el.dataset.phase)));
    });
  }


  /* ═══════════════════════════════════════════════════════════════════
     8.  BUILD TECH GRID + 3D TILT
     ─────────────────────────────────────────────────────────────────
     PERFORMANCE CHANGE: getBoundingClientRect() was called on every raw
     mousemove event, forcing a layout reflow each time.  Now the rect
     is cached once on mouseenter; only cheap math runs inside the RAF
     loop — one pending RAF per card, never stacking calls.
  ═══════════════════════════════════════════════════════════════════ */
  const TECHS = [
    { icon:'⚛',  name:'React',         cat:'Frontend' },
    { icon:'▲',  name:'Next.js',        cat:'Frontend' },
    { icon:'🔷', name:'TypeScript',     cat:'Language' },
    { icon:'🎨', name:'Tailwind CSS',   cat:'Frontend' },
    { icon:'🟢', name:'Node.js',        cat:'Backend' },
    { icon:'🦕', name:'Deno',           cat:'Backend' },
    { icon:'🐍', name:'Python',         cat:'Backend' },
    { icon:'🔴', name:'Redis',          cat:'Database' },
    { icon:'🐘', name:'PostgreSQL',     cat:'Database' },
    { icon:'🍃', name:'MongoDB',        cat:'Database' },
    { icon:'🔍', name:'Elasticsearch',  cat:'Database' },
    { icon:'☁',  name:'AWS',            cat:'Infrastructure' },
    { icon:'⎈',  name:'Kubernetes',     cat:'Infrastructure' },
    { icon:'🐳', name:'Docker',         cat:'Infrastructure' },
    { icon:'🔁', name:'Nginx',          cat:'Infrastructure' },
    { icon:'🤖', name:'OpenAI API',     cat:'AI / ML' },
    { icon:'🧠', name:'Custom LLM',     cat:'AI / ML' },
    { icon:'📐', name:'Pinecone',       cat:'AI / ML' },
    { icon:'📡', name:'WebRTC',         cat:'Voice / Video' },
  ];

  function buildTechGrid() {
    const grid = document.getElementById('tech-grid');
    if (!grid) return;

    TECHS.forEach(t => {
      const el = document.createElement('div');
      el.className = 'tech-cell hover-target';
      el.innerHTML = `<span class="t-icon">${t.icon}</span><span class="t-name">${t.name}</span><span class="t-cat">${t.cat}</span>`;
      grid.appendChild(el);
    });

    gsap.fromTo('.tech-cell',
      { opacity:0, y:18 },
      { opacity:1, y:0, duration:.38, stagger:.045, ease:'power2.out',
        scrollTrigger: { trigger:'#tech-stack', start:'top 72%' } }
    );

    // 3D Tilt — RAF-gated; getBoundingClientRect cached on mouseenter (safe),
    // only cheap math runs per RAF frame — never stacks more than 1 pending call.
    document.querySelectorAll('.tech-cell').forEach(card => {
      let rect    = null;  // cached bounding box
      let tiltRaf = null;  // pending RAF handle
      let mx = 0, my = 0; // raw pointer coords

      card.addEventListener('mouseenter', () => {
        rect = card.getBoundingClientRect(); // one layout read — safe here
      });

      card.addEventListener('mousemove', e => {
        mx = e.clientX;
        my = e.clientY;
        if (tiltRaf !== null) return; // gate: one RAF pending at most
        tiltRaf = requestAnimationFrame(() => {
          tiltRaf = null;
          if (!rect) return;
          const rx  =  ((my - rect.top  - rect.height / 2) / (rect.height / 2)) * 15;
          const ry  = -((mx - rect.left - rect.width  / 2) / (rect.width  / 2)) * 15;
          const px  = ((mx - rect.left) / rect.width  * 100).toFixed(1) + '%';
          const py  = ((my - rect.top ) / rect.height * 100).toFixed(1) + '%';
          card.style.transform = `perspective(540px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.07)`;
          card.style.boxShadow = `0 0 26px rgba(192,0,26,.20), 0 ${10 + Math.abs(rx * 0.4)}px 30px rgba(0,0,0,.45)`;
          card.style.setProperty('--mx', px);
          card.style.setProperty('--my', py);
        });
      }, { passive: true });

      card.addEventListener('mouseleave', () => {
        rect = null;
        if (tiltRaf !== null) { cancelAnimationFrame(tiltRaf); tiltRaf = null; }
        card.style.transform = '';
        card.style.boxShadow = '';
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════════════
     9.  BUILD COMPARISON TABLE
  ═══════════════════════════════════════════════════════════════════ */
  const CMP = {
    cols: ['Feature','IROB','IMDb','Fandom','Reddit','Discord','AO3'],
    rows: [
      ['Movie & TV Database',    '✓','✓','✗','✗','✗','✗'],
      ['User Ratings & Reviews', '✓','✓','✗','~','✗','~'],
      ['Entertainment News Feed','✓','✗','~','✓','✗','✗'],
      ['Fan Wikis / Lore',       '✓','✗','✓','✗','✗','✗'],
      ['Discussion Forums',      '✓','~','~','✓','✗','~'],
      ['Community Servers',      '✓','✗','✗','✗','✓','✗'],
      ['Fanfiction Archive',     '✓','✗','~','✗','✗','✓'],
      ['Voice & Video Chat',     '✓','✗','✗','✗','✓','✗'],
      ['AI Recommendations',     '✓','~','✗','✗','✗','✗'],
      ['Watch Party Sync',       '✓','✗','✗','✗','~','✗'],
      ['Unified Social Profile', '✓','~','~','✓','✓','~'],
      ['Unified Cross-Search',   '✓','✗','✗','✗','✗','✗'],
    ],
  };

  function buildComparisonTable() {
    const tbl = document.getElementById('cmp-table');
    if (!tbl) return;
    const thead = document.createElement('thead');
    const htr   = document.createElement('tr');
    CMP.cols.forEach((h,i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i===1) th.classList.add('col-irob');
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    CMP.rows.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach((c,i) => {
        const td = document.createElement('td');
        if (i===1) td.classList.add('col-irob');
        if      (c==='✓') td.innerHTML = `<span class="cic">✓</span>`;
        else if (c==='✗') td.innerHTML = `<span class="cix">✗</span>`;
        else if (c==='~') td.innerHTML = `<span class="cip">PARTIAL</span>`;
        else              td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    gsap.fromTo('tbody tr',
      { opacity:0, x:-16 },
      { opacity:1, x:0, duration:.38, stagger:.07,
        scrollTrigger: { trigger:'#comparison', start:'top 72%' } }
    );
  }


  /* ═══════════════════════════════════════════════════════════════════
     10.  BUILD REVENUE GRID
  ═══════════════════════════════════════════════════════════════════ */
  const REVENUES = [
    { t:'Premium Subscriptions',  d:'Ad-free experience, exclusive AI tools, early feature access, and expanded storage for power users.' },
    { t:'Targeted Advertising',   d:'Non-intrusive, context-aware ads served across entertainment feeds, relevant to what users are watching.' },
    { t:'Creator Monetization',   d:'Revenue share with wiki editors, fanfic authors, forum contributors, and community moderators.' },
    { t:'Studio Partnerships',    d:'Official agreements with major studios for exclusive content, pre-release trailers, and promotional campaigns.' },
    { t:'API Access Licensing',   d:'Tiered API access for developers, data vendors, streaming services, and third-party integrations.' },
    { t:'Server Boosts & Tokens', d:'In-platform virtual currency for community server upgrades, custom badges, and premium features.' },
    { t:'Digital Marketplace',    d:'Fan art commissions, licensed merchandise, and exclusive digital collectibles sold through an integrated marketplace.' },
    { t:'Data Intelligence',      d:'Anonymized entertainment trend reports and audience analytics sold to studios and production companies.' },
    { t:'Enterprise Spaces',      d:'Branded community portals, analytics dashboards, and management toolkits sold to major IP holders.' },
  ];

  function buildRevenueGrid() {
    const grid = document.getElementById('rev-grid');
    if (!grid) return;
    REVENUES.forEach((r,i) => {
      const el = document.createElement('div');
      el.className = 'rev-cell hover-target';
      el.innerHTML = `
        <div class="rev-num">${String(i+1).padStart(2,'0')}</div>
        <h3 class="rev-title">${r.t}</h3>
        <p class="rev-desc">${r.d}</p>`;
      grid.appendChild(el);
    });
    gsap.fromTo('.rev-cell',
      { opacity:0, y:28 },
      { opacity:1, y:0, duration:.6, stagger:.09,
        scrollTrigger: { trigger:'#revenue', start:'top 75%' } }
    );
  }


  /* ═══════════════════════════════════════════════════════════════════
     11.  MODAL — Phase-specific UI simulations using MOCK_DATABASE
  ═══════════════════════════════════════════════════════════════════ */

  // Shared mini-component helpers
  const $ = (cls, s='') =>
    `<span style="font-family:'JetBrains Mono',monospace;font-size:.52rem;letter-spacing:.22em;color:${cls};${s}">`;
  const accentBar = (label, note='') => `
    <div style="background:rgba(192,0,26,.05);border:1px solid rgba(192,0,26,.18);
                padding:.75rem 1.1rem;margin-bottom:1.3rem;display:flex;align-items:center;gap:.6rem;">
      ${$('var(--accent)')}${label}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:.49rem;color:var(--muted);margin-left:auto;">${note}</span>
    </div>`;

  // ─── PHASE 1: Media Database (IMDb replacement) ───────────────────────
  function renderPhase1() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const movies = db.trending_movies || [];
    const m = movies[0] || {};
    return `
      ${accentBar('IROB MEDIA DB', '12M+ ENTRIES · LIVE')}
      <div style="display:flex;gap:1.3rem;margin-bottom:1.5rem;">
        <img src="${m.poster||''}" alt="poster" style="width:108px;height:162px;object-fit:cover;flex-shrink:0;
             border:1px solid rgba(192,0,26,.22);" onerror="this.style.background='rgba(192,0,26,.1)'"/>
        <div style="flex:1;min-width:0;">
          ${$('var(--accent)')}${(m.genre||[]).join(' · ')}</span>
          <h4 style="font-family:'Bebas Neue',cursive;font-size:1.65rem;letter-spacing:.05em;
                     margin:.3rem 0 .4rem;line-height:1;">${m.title||'—'}</h4>
          <div style="display:flex;gap:.9rem;align-items:center;flex-wrap:wrap;margin-bottom:.7rem;">
            <span style="font-family:'Bebas Neue',cursive;font-size:1.25rem;color:#f5c518;">★ ${m.rating||'—'}</span>
            ${$('var(--muted)')}${(m.votes||0).toLocaleString()} votes</span>
            ${$('var(--dim)')}${m.mpaa||''} · ${m.runtime_min||'?'}m</span>
          </div>
          <p style="font-size:.75rem;color:var(--muted);line-height:1.62;margin-bottom:.7rem;">${m.plot||''}</p>
          ${$('var(--muted)')}DIR: <span style="color:var(--text);font-weight:700;">${m.director||'—'}</span></span>
        </div>
      </div>
      <div style="margin-bottom:1.3rem;">
        ${$('var(--accent)')}TOP CAST</span>
        <div style="display:flex;gap:.9rem;flex-wrap:wrap;margin-top:.7rem;">
          ${(m.cast||[]).map(c=>`
            <div style="display:flex;flex-direction:column;align-items:center;gap:.3rem;min-width:66px;text-align:center;">
              <img src="${c.headshot}" alt="${c.name}" style="width:50px;height:50px;border-radius:50%;
                   object-fit:cover;border:1px solid rgba(192,0,26,.25);" onerror="this.style.background='rgba(192,0,26,.15)'"/>
              <span style="font-size:.64rem;font-weight:700;">${c.name}</span>
              ${$('var(--muted)')}${c.role}</span>
            </div>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(192,0,26,.22);">
        ${[['IROB SCORE',`${m.irob_score||'—'}%`],['STATUS',m.status||'—'],['TRENDING',`#${m.trending_rank||'—'}`]].map(([l,v])=>`
          <div style="background:var(--bg);padding:.9rem;text-align:center;">
            <div style="font-family:'Bebas Neue',cursive;font-size:1.3rem;">${v}</div>
            ${$('var(--muted)')}${l}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:.8rem;">${$('var(--muted)')}STREAM ON: </span>
        ${(m.streaming_on||[]).map(s=>`<span style="font-family:'JetBrains Mono',monospace;font-size:.55rem;
          color:var(--accent);margin-left:.4rem;">${s}</span>`).join('')}
      </div>`;
  }

  // ─── PHASE 2: News+ (Rotten Tomatoes / Variety replacement) ──────────
  function renderPhase2() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const movies = db.trending_movies || [];
    return `
      ${accentBar('IROB NEWS+', '500+ SOURCES · 60s REFRESH')}
      ${movies.map(m=>`
        <div style="border-bottom:1px solid rgba(255,255,255,.05);padding:.85rem 0;display:flex;gap:1rem;">
          <img src="${m.backdrop}" style="width:88px;height:52px;object-fit:cover;flex-shrink:0;
               border:1px solid rgba(192,0,26,.15);" onerror="this.style.background='rgba(192,0,26,.1)'"/>
          <div style="flex:1;">
            ${$('var(--accent)')}REVIEW ROUNDUP</span>
            <div style="font-weight:700;font-size:.82rem;margin:.25rem 0 .4rem;">"${m.title}" — Critical vs Audience Split</div>
            <div style="display:flex;gap:1.1rem;align-items:center;">
              <div style="text-align:center;">
                <div style="font-family:'Bebas Neue',cursive;font-size:1.1rem;color:#4ade80;">${m.irob_score}%</div>
                ${$('var(--muted)')}CRITICS</span>
              </div>
              <div style="text-align:center;">
                <div style="font-family:'Bebas Neue',cursive;font-size:1.1rem;color:#fbbf24;">${Math.min(m.irob_score+7,100)}%</div>
                ${$('var(--muted)')}AUDIENCE</span>
              </div>
              ${$('var(--dim)',';align-self:center;')}${m.votes.toLocaleString()} ratings</span>
            </div>
          </div>
        </div>`).join('')}
      <div style="margin-top:.9rem;padding:.8rem;background:rgba(255,255,255,.02);
                  border:1px solid rgba(255,255,255,.05);">
        ${$('var(--accent)')}BREAKING · BOX OFFICE LIVE</span>
        <div style="margin-top:.5rem;">
          ${movies.map((m,i)=>`
            <div style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--muted);
                 display:flex;justify-content:space-between;padding:.28rem 0;
                 border-bottom:1px solid rgba(255,255,255,.04);">
              <span>${i+1}. ${m.title}</span>
              <span style="color:var(--text);">$${(22+i*15+Math.round(m.rating*2)).toFixed(1)}M WKD</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ─── PHASE 3: Discussion Forums (Reddit replacement) ─────────────────
  function renderPhase3() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const threads = db.live_forum_threads || [];
    return `
      ${accentBar('IROB FORUMS', `LIVE · ${threads.filter(t=>t.is_live).length} ACTIVE THREADS`)}
      ${threads.map(t=>`
        <div style="border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.014);
                    padding:.95rem 1.1rem;margin-bottom:.75rem;position:relative;">
          ${t.is_live ? `<span style="position:absolute;top:.7rem;right:.8rem;font-family:'JetBrains Mono',
            monospace;font-size:.48rem;color:#4ade80;letter-spacing:.18em;">● LIVE</span>` : ''}
          <div style="display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;margin-bottom:.5rem;">
            ${$('var(--accent)')}${t.board}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:.48rem;padding:.12rem .45rem;
              border:1px solid rgba(192,0,26,.3);color:var(--accent);">${t.flair}</span>
            ${t.awards.slice(0,3).map(a=>`<span style="font-family:'JetBrains Mono',monospace;
              font-size:.46rem;padding:.1rem .38rem;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);">${a}</span>`).join('')}
          </div>
          <div style="font-weight:700;font-size:.84rem;line-height:1.45;margin-bottom:.45rem;">${t.title}</div>
          <p style="font-size:.71rem;color:var(--muted);line-height:1.58;margin-bottom:.6rem;">
            ${t.preview.substring(0,180)}…</p>
          <div style="display:flex;gap:1.3rem;align-items:center;flex-wrap:wrap;">
            ${$('var(--dim)')}▲ <span style="color:var(--text);font-weight:700;">${t.upvotes.toLocaleString()}</span></span>
            ${$('var(--dim)')}💬 <span style="color:var(--text);font-weight:700;">${t.comment_count.toLocaleString()}</span></span>
            ${$('var(--muted)')}by <span style="color:var(--text);">${t.author}</span>
              · <span style="color:var(--accent);">${t.author_flair}</span></span>
          </div>
          <div style="margin-top:.7rem;padding:.65rem .8rem;background:rgba(255,255,255,.02);
                      border-left:2px solid var(--accent);">
            ${$('var(--accent)')}TOP COMMENT · ${t.top_comment.author} · ▲${t.top_comment.upvotes.toLocaleString()}</span>
            <div style="font-size:.7rem;color:var(--muted);line-height:1.55;margin-top:.25rem;">
              ${t.top_comment.body}</div>
          </div>
        </div>`).join('')}`;
  }

  // ─── PHASE 4: Community Servers (Discord replacement) ────────────────
  function renderPhase4() {
    const channels = ['# general','# spoilers','# fan-art','# soundtrack','🔊 watch-party','🔊 discussion'];
    const msgs = [
      { i:'P', u:'phantomwave_99',  r:'Verified Fan',     t:'2m ago',  m:'The ending of Neon Requiem completely broke me. Second watch hits different.' },
      { i:'L', u:'lorekeeper_sol',  r:'Top Contributor',  t:'5m ago',  m:'Anyone notice the blue umbrella disappears in the final scene? See my breakdown thread.' },
      { i:'K', u:'cinephile_kira',  r:'Member',           t:'8m ago',  m:'@lorekeeper_sol that thread is outstanding — my mind is completely wrecked.' },
    ];
    return `
      ${accentBar('IROB COMMUNITY SERVERS', '99.99% UPTIME · <50ms LATENCY')}
      <div style="display:flex;height:296px;border:1px solid rgba(255,255,255,.07);overflow:hidden;">
        <!-- Server list -->
        <div style="width:50px;background:rgba(0,0,0,.45);padding:.6rem .4rem;display:flex;
                    flex-direction:column;gap:.45rem;align-items:center;
                    border-right:1px solid rgba(255,255,255,.04);">
          ${['🎬','📺','🎵','🎮','🔴'].map((ic,j)=>`
            <div style="width:34px;height:34px;background:${j===0?'rgba(192,0,26,.25)':'rgba(255,255,255,.04)'};
                        border:1px solid ${j===0?'rgba(192,0,26,.4)':'rgba(255,255,255,.07)'};
                        display:flex;align-items:center;justify-content:center;font-size:.9rem;cursor:pointer;">
              ${ic}</div>`).join('')}
        </div>
        <!-- Channel list -->
        <div style="width:152px;background:rgba(255,255,255,.012);padding:.7rem .5rem;
                    border-right:1px solid rgba(255,255,255,.05);overflow-y:auto;">
          ${$('var(--accent)',';letter-spacing:.2em;display:block;padding:.35rem .4rem;margin-bottom:.3rem;background:rgba(192,0,26,.07);')}📽 NEON REQUIEM</span>
          ${channels.map((c,j)=>`<div style="font-family:'JetBrains Mono',monospace;font-size:.54rem;
            color:${j===0?'var(--text)':'var(--muted)'};padding:.28rem .4rem;cursor:pointer;
            ${j===0?'background:rgba(255,255,255,.04);':''}border-radius:2px;">${c}</div>`).join('')}
          ${$('var(--accent)',';letter-spacing:.2em;display:block;padding:.35rem .4rem;margin:.6rem 0 .3rem;background:rgba(192,0,26,.07);')}🌊 PALE DOMINION</span>
          ${['# lore','# theories','🔊 live-ama'].map(c=>`<div style="font-family:'JetBrains Mono',
            monospace;font-size:.54rem;color:var(--muted);padding:.28rem .4rem;">${c}</div>`).join('')}
        </div>
        <!-- Chat pane -->
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
          <div style="padding:.6rem .9rem;border-bottom:1px solid rgba(255,255,255,.05);
                      font-family:'JetBrains Mono',monospace;font-size:.52rem;color:var(--muted);">
            # general &nbsp;·&nbsp; 2,847 members online</div>
          <div style="flex:1;padding:.7rem .9rem;overflow-y:auto;display:flex;flex-direction:column;gap:.65rem;">
            ${msgs.map(msg=>`
              <div style="display:flex;gap:.6rem;">
                <div style="width:28px;height:28px;background:rgba(192,0,26,.22);border-radius:50%;
                            flex-shrink:0;display:flex;align-items:center;justify-content:center;
                            font-weight:700;font-size:.7rem;">${msg.i}</div>
                <div>
                  <div style="font-family:'JetBrains Mono',monospace;font-size:.52rem;margin-bottom:.18rem;">
                    <span style="color:var(--text);font-weight:700;">${msg.u}</span>
                    <span style="color:var(--accent);margin-left:.35rem;">${msg.r}</span>
                    <span style="color:var(--dim);margin-left:.4rem;">${msg.t}</span>
                  </div>
                  <div style="font-size:.7rem;color:var(--muted);line-height:1.5;">${msg.m}</div>
                </div>
              </div>`).join('')}
          </div>
          <div style="padding:.45rem .7rem;border-top:1px solid rgba(255,255,255,.05);">
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
                        padding:.45rem .75rem;font-family:'JetBrains Mono',monospace;
                        font-size:.52rem;color:var(--dim);">Message # general…</div>
          </div>
        </div>
      </div>`;
  }

  // ─── PHASE 5: Wiki+ (Fandom replacement) ─────────────────────────────
  function renderPhase5() {
    const terms = ['Det. Mira Yun','Victor Halloway','The Architect','Memory Banks','The Pale Exchange','Mnemonic Law'];
    const stats = [['Articles','4,821'],['Active Editors','183'],['Edits Today','1,204'],['Images','12,840']];
    return `
      ${accentBar('IROB WIKI+', '50K+ WIKIS · AD-FREE')}
      <div style="display:flex;gap:1.2rem;">
        <div style="flex:1;min-width:0;">
          <h4 style="font-family:'Bebas Neue',cursive;font-size:1.45rem;letter-spacing:.05em;
                     border-bottom:1px solid rgba(192,0,26,.28);padding-bottom:.45rem;margin-bottom:.75rem;">
            Neon Requiem Wiki</h4>
          ${$('var(--accent)',';display:block;margin-bottom:.4rem;')}FEATURED ARTICLE</span>
          <div style="font-weight:700;font-size:.88rem;margin-bottom:.35rem;">The Memory Black Market</div>
          <p style="font-size:.72rem;color:var(--muted);line-height:1.63;margin-bottom:.75rem;">
            The Memory Black Market (MBM) is the primary criminal ecosystem of the Neon Requiem universe.
            Founded in the mid-2040s following deregulation of the Mnemonic Transfer Act, the MBM operates
            across seven sectors of the city's underground infrastructure…</p>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.35rem;margin-bottom:.75rem;">
            ${terms.map(t=>`
              <div style="font-family:'JetBrains Mono',monospace;font-size:.56rem;color:var(--muted);
                          padding:.32rem .55rem;border:1px solid rgba(255,255,255,.05);
                          background:rgba(255,255,255,.012);cursor:pointer;
                          transition:border-color .2s;"
                   onmouseover="this.style.borderColor='rgba(192,0,26,.3)'"
                   onmouseout="this.style.borderColor='rgba(255,255,255,.05)'">
                &rsaquo; ${t}</div>`).join('')}
          </div>
          ${$('var(--dim)',';font-size:.51rem;')}Last edited by
            <span style="color:var(--text);">lorekeeper_sol</span> · 14 min ago ·
            <span style="color:var(--accent);">2,347 revisions</span></span>
        </div>
        <div style="width:152px;flex-shrink:0;">
          ${$('var(--accent)',';display:block;margin-bottom:.5rem;')}WIKI STATS</span>
          ${stats.map(([l,v])=>`
            <div style="padding:.45rem 0;border-bottom:1px solid rgba(255,255,255,.04);">
              <div style="font-family:'Bebas Neue',cursive;font-size:1.05rem;">${v}</div>
              ${$('var(--muted)')}${l}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ─── PHASE 6: Fanfiction (AO3 replacement) ───────────────────────────
  function renderPhase6() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const fics = db.fanfiction_entries || [];
    return `
      ${accentBar('IROB FANFICTION', '200+ TAG CATEGORIES')}
      ${fics.map(f=>`
        <div style="display:flex;gap:.95rem;padding:.85rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
          <img src="${f.cover}" alt="cover" style="width:56px;height:74px;object-fit:cover;flex-shrink:0;
               border:1px solid rgba(192,0,26,.16);" onerror="this.style.background='rgba(192,0,26,.1)'"/>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;gap:.42rem;align-items:center;flex-wrap:wrap;margin-bottom:.28rem;">
              ${$('var(--accent)')}${f.fandom}</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:.45rem;padding:.1rem .38rem;
                border:1px solid rgba(192,0,26,.25);color:var(--accent);">${f.rating.toUpperCase()}</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:.45rem;
                color:${f.complete?'#4ade80':'#fbbf24'};">
                ${f.complete ? '✓ COMPLETE' : '● IN PROGRESS'}</span>
            </div>
            <div style="font-weight:700;font-size:.84rem;margin-bottom:.2rem;">${f.title}</div>
            ${$('var(--muted)')}by <span style="color:var(--text);">${f.author}</span>
              · <span style="color:var(--accent);">${f.author_badge}</span></span>
            <p style="font-size:.69rem;color:var(--muted);line-height:1.54;margin:.35rem 0 .45rem;">
              ${f.summary.substring(0,138)}…</p>
            <div style="display:flex;gap:.9rem;font-family:'JetBrains Mono',monospace;font-size:.51rem;color:var(--dim);">
              <span>♥ ${f.kudos.toLocaleString()}</span>
              <span>🔖 ${f.bookmarks.toLocaleString()}</span>
              <span>💬 ${f.comments.toLocaleString()}</span>
              <span>${(f.word_count/1000).toFixed(0)}k words · ${f.chapter_count} ch</span>
            </div>
          </div>
        </div>`).join('')}`;
  }

  // ─── PHASE 7: Voice & Video ───────────────────────────────────────────
  function renderPhase7() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const m  = (db.trending_movies || [])[0] || {};
    const participants = [
      { i:'P', u:'phantomwave', s:'TALKING' },
      { i:'L', u:'lorekeeper',  s:'MUTED'   },
      { i:'K', u:'kira_c',      s:'ACTIVE'  },
      { i:'V', u:'velvet_q',    s:'ACTIVE'  },
    ];
    return `
      ${accentBar('IROB VOICE & VIDEO', 'WebRTC · <30ms · 10K ROOMS')}
      <div style="background:#000;border:1px solid rgba(255,255,255,.08);height:150px;
                  position:relative;margin-bottom:.9rem;overflow:hidden;">
        <img src="${m.backdrop||''}" style="width:100%;height:100%;object-fit:cover;opacity:.45;"
             onerror="this.style.background='rgba(192,0,26,.08)'"/>
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85),transparent)"></div>
        <div style="position:absolute;top:.7rem;left:.8rem;background:rgba(192,0,26,.9);
                    font-family:'JetBrains Mono',monospace;font-size:.48rem;padding:.18rem .55rem;
                    color:#fff;letter-spacing:.14em;">WATCH PARTY · LIVE</div>
        <div style="position:absolute;bottom:.75rem;left:.9rem;font-family:'JetBrains Mono',
                    monospace;font-size:.56rem;color:#fff;">▶ ${m.title||'Neon Requiem'} · 01:14:22</div>
        <div style="position:absolute;bottom:.75rem;right:.9rem;font-family:'JetBrains Mono',
                    monospace;font-size:.52rem;color:var(--accent);">● 842 WATCHING</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.45rem;margin-bottom:.9rem;">
        ${participants.map(p=>`
          <div style="text-align:center;padding:.65rem .4rem;
                      border:1px solid ${p.s==='TALKING'?'var(--accent)':'rgba(255,255,255,.06)'};
                      background:rgba(255,255,255,.014);
                      ${p.s==='TALKING'?'box-shadow:0 0 12px rgba(192,0,26,.2);':''}">
            <div style="width:34px;height:34px;background:rgba(192,0,26,.2);border-radius:50%;
                        margin:0 auto .35rem;display:flex;align-items:center;justify-content:center;
                        font-weight:700;font-size:.78rem;">${p.i}</div>
            ${$('var(--text)',';display:block;margin-bottom:.18rem;font-size:.52rem;')}${p.u}</span>
            ${$(`${p.s==='TALKING'?'var(--accent)':p.s==='MUTED'?'var(--dim)':'#4ade80'}`,';font-size:.44rem;')}${p.s}</span>
          </div>`).join('')}
      </div>
      <div style="padding:.65rem;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);">
        ${$('var(--accent)',';display:block;margin-bottom:.4rem;')}LIVE REACTIONS STREAM</span>
        <div style="font-size:1.05rem;letter-spacing:.18em;">🔥❤️😱🎉🤯🔥❤️😱</div>
      </div>`;
  }

  // ─── PHASE 8: AI Layer ────────────────────────────────────────────────
  function renderPhase8() {
    const db = typeof MOCK_DATABASE !== 'undefined' ? MOCK_DATABASE : {};
    const modules = [
      ['SPOILER DETECTION',    'Active across all 12M+ media entries — real-time'],
      ['FANFIC AUTO-TAGGER',   '84K+ works tagged this week with 98.2% accuracy'],
      ['TREND ANALYSIS',       'Processing 2.4M sentiment signals / hour'],
      ['CONTENT MODERATION',   '24/7 AI coverage across 50K+ community servers'],
    ];
    return `
      ${accentBar('IROB AI LAYER', '50M+ DAILY INFERENCES · <200ms')}
      <div style="padding:.8rem .95rem;border:1px solid rgba(192,0,26,.22);
                  background:rgba(192,0,26,.04);margin-bottom:1rem;">
        ${$('var(--accent)',';display:block;margin-bottom:.6rem;')}IROB ASSISTANT — LIVE SESSION</span>
        <div style="display:flex;flex-direction:column;gap:.55rem;">
          <div style="display:flex;justify-content:flex-end;">
            <div style="background:rgba(192,0,26,.15);border:1px solid rgba(192,0,26,.28);
                        padding:.42rem .75rem;max-width:76%;font-size:.7rem;
                        color:var(--text);line-height:1.52;">
              Recommend something like Neon Requiem but shorter</div>
          </div>
          <div style="display:flex;gap:.6rem;">
            <div style="width:24px;height:24px;background:var(--accent);border-radius:50%;flex-shrink:0;
                        display:flex;align-items:center;justify-content:center;
                        font-family:'JetBrains Mono',monospace;font-size:.48rem;font-weight:700;">AI</div>
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
                        padding:.42rem .75rem;max-width:82%;font-size:.7rem;
                        color:var(--muted);line-height:1.58;">
              Based on your watch history:
              <span style="color:var(--text);">Blade Runner 2049</span> (try the 2hr cut),
              <span style="color:var(--text);">Devs</span> (TV · 8 episodes),
              <span style="color:var(--text);">Coherence</span> (89m · <span style="color:#4ade80;">97% match</span>).
              Want spoiler-free summaries?</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.55rem;margin-bottom:.9rem;">
        ${modules.map(([t,d])=>`
          <div style="padding:.65rem;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.014);">
            ${$('var(--accent)',';display:block;margin-bottom:.28rem;')}${t}</span>
            <div style="font-size:.66rem;color:var(--muted);">${d}</div>
          </div>`).join('')}
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:.51rem;padding:.55rem .75rem;
                  border:1px solid rgba(192,0,26,.2);display:flex;justify-content:space-between;
                  flex-wrap:wrap;gap:.5rem;color:var(--muted);">
        <span>MODEL: <span style="color:var(--text);">GPT-4o + Custom Fine-tune</span></span>
        <span>INFERENCE: <span style="color:#4ade80;">&lt;200ms P99</span></span>
        <span>DAILY CALLS: <span style="color:var(--accent);">50M+</span></span>
      </div>`;
  }

  // ─── Modal open / close ───────────────────────────────────────────────
  const RENDERERS = { 1:renderPhase1, 2:renderPhase2, 3:renderPhase3, 4:renderPhase4,
                      5:renderPhase5, 6:renderPhase6, 7:renderPhase7, 8:renderPhase8 };

  function openModal(id) {
    const ph = typeof PHASES !== 'undefined' ? PHASES.find(p => p.id === id) : null;
    if (!ph) return;

    document.getElementById('m-code').textContent  = `${ph.code} — ${ph.timeline}`;
    document.getElementById('m-title').textContent = ph.title;

    const render = RENDERERS[id];
    if (render) {
      document.getElementById('m-body').innerHTML = render();
    } else {
      const kpiHTML = ph.kpis ? `
        <div class="mrow">
          <div class="mlabel">Key Metrics</div>
          <div class="m-kpi-grid">
            ${Object.entries(ph.kpis).map(([k,v])=>
              `<div class="m-kpi"><span class="m-kpi-val">${v}</span><span class="m-kpi-lbl">${k}</span></div>`
            ).join('')}
          </div>
        </div>` : '';
      document.getElementById('m-body').innerHTML = `
        <div class="mrow"><div class="mlabel">Replaces</div><div class="mval">${ph.replaces}</div></div>
        <div class="mrow"><div class="mlabel">Phase Overview</div><p class="mpara">${ph.description}</p></div>
        <div class="mrow">
          <div class="mlabel">Full Feature Set</div>
          <div class="m-features-grid">${ph.features.map(f=>`<div class="m-feat">${f}</div>`).join('')}</div>
        </div>${kpiHTML}`;
    }
    document.getElementById('ui-modal').classList.add('open');
  }

  function closeModal() { document.getElementById('ui-modal').classList.remove('open'); }

  const mClose = document.getElementById('m-close');
  const modal  = document.getElementById('ui-modal');
  if (mClose) mClose.addEventListener('click', closeModal);
  if (modal)  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Expose for any inline onclick attributes that may exist
  window.openModal  = openModal;
  window.closeModal = closeModal;


  /* ═══════════════════════════════════════════════════════════════════
     12.  HERO GSAP ENTRANCE — fires after loader (3s offset)
  ═══════════════════════════════════════════════════════════════════ */
  const heroTL = gsap.timeline({ delay: 3.05 });
  heroTL
    .fromTo('.hero-badge', { opacity:0, y:-18 }, { opacity:1, y:0, duration:.7 })
    .fromTo('.hero-title',  { opacity:0, y:45  }, { opacity:1, y:0, duration:1,  ease:'power3.out' }, .2)
    .fromTo('.hero-sub',    { opacity:0        }, { opacity:1, duration:.8 }, .8)
    .fromTo('.stats-grid',  { opacity:0, y:28  }, { opacity:1, y:0, duration:.8, ease:'power2.out' }, 1.0)
    .fromTo('.scroll-cue',  { opacity:0        }, { opacity:1, duration:.9 }, 1.8);

  // Eyebrows, titles, dividers on scroll
  gsap.utils.toArray('.eyebrow, .sec-title, .divider').forEach(el => {
    gsap.fromTo(el, { opacity:0, y:22 },
      { opacity:1, y:0, duration:.75, scrollTrigger: { trigger:el, start:'top 84%' } });
  });


  /* ═══════════════════════════════════════════════════════════════════
     13.  INIT — build all dynamic sections
  ═══════════════════════════════════════════════════════════════════ */
  buildTimeline();
  buildTechGrid();
  buildComparisonTable();
  buildRevenueGrid();

}); // end DOMContentLoaded
