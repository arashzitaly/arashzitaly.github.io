/* Arash Ziaee — portfolio behaviour.
   Graph canvases, the scroll rail, reveals and counters.
   Native anchors and isometric object buttons drive navigation.

   No element.style writes anywhere in this file: the CSP has no
   style-src 'unsafe-inline', so they are blocked in production. */

(function () {
  'use strict';

  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var slow = motionPreference.matches;
  motionPreference.addEventListener('change', function (e) { slow = e.matches; });

  /* ---------------------------------------------------------
     1. Graph canvases.

     One renderer, several instances. The hero runs a large, slow
     field; the seam strips between sections run a smaller, faster
     one on a gradient that bridges a dark section into a light one.
     --------------------------------------------------------- */

  var PRESETS = {
    hero: { area: 20000, max: 58, link: 165, speed: 0.15,
            node: '177,140,255', nodeA: 0.26, hubA: 0.60, linkA: 0.13 },
    seam: { area: 9000,  max: 34, link: 120, speed: 0.22,
            node: '124,92,224',  nodeA: 0.40, hubA: 0.78, linkA: 0.22 }
  };

  /* Links are drawn in LANES instead of one at a time.

     The old loop set ctx.strokeStyle for every pair inside the link
     radius -- about 1,600 pairs on the hero, sixty times a second, each
     one building a fresh 'rgba(...)' string with a toFixed(3) in it.
     That is ~96,000 string allocations a second before a single line is
     drawn, and it is the whole cost of the effect on a slower machine.

     Now the distance decides which of six opacity lanes a segment falls
     in; each lane is one beginPath, one strokeStyle, one stroke. The
     lane arrays are reused between frames, so a warm frame allocates
     nothing at all. The banding six lanes produce is invisible at these
     alphas -- the strongest link is 0.22. */
  var LANES = 6;

  function makeGraph(canvas) {
    var cfg = PRESETS[canvas.dataset.graph] || PRESETS.hero;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    var nodes = [], w = 0, h = 0, raf = null;

    var link2 = cfg.link * cfg.link;
    var laneStroke = [], lanes = [], q;
    for (q = 0; q < LANES; q++) {
      laneStroke.push('rgba(' + cfg.node + ',' +
        (cfg.linkA * (q + 1) / LANES).toFixed(3) + ')');
      lanes.push([]);
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var n = Math.min(Math.round((w * h) / cfg.area), cfg.max);
      nodes = [];
      for (var i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * cfg.speed,
          vy: (Math.random() - 0.5) * cfg.speed,
          r: Math.random() * 1.5 + 0.8,
          hub: Math.random() > 0.86
        });
      }
    }

    function frame() {
      raf = null;
      ctx.clearRect(0, 0, w, h);
      var i, j, k, n = nodes.length;

      for (k = 0; k < LANES; k++) lanes[k].length = 0;

      for (i = 0; i < n; i++) {
        var a = nodes[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;

        for (j = i + 1; j < n; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 >= link2) continue;          // squared: no sqrt for a miss
          var lane = (1 - Math.sqrt(d2) / cfg.link) * LANES | 0;
          if (lane >= LANES) lane = LANES - 1;
          lanes[lane].push(a.x, a.y, b.x, b.y);
        }
      }

      ctx.lineWidth = 1;
      for (k = 0; k < LANES; k++) {
        var seg = lanes[k], m = seg.length;
        if (!m) continue;
        ctx.strokeStyle = laneStroke[k];
        ctx.beginPath();
        for (i = 0; i < m; i += 4) {
          ctx.moveTo(seg[i], seg[i + 1]);
          ctx.lineTo(seg[i + 2], seg[i + 3]);
        }
        ctx.stroke();
      }

      // two fill passes, two fillStyle writes, instead of one per node
      for (k = 0; k < 2; k++) {
        ctx.fillStyle = 'rgba(' + cfg.node + ',' + (k ? cfg.hubA : cfg.nodeA) + ')';
        ctx.beginPath();
        for (i = 0; i < n; i++) {
          var p = nodes[i];
          if (!p.hub !== !k) continue;
          var r = k ? p.r * 1.8 : p.r;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      if (!slow && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function start() { if (!slow && !document.hidden && raf === null) raf = requestAnimationFrame(frame); }
    function stop()  { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }

    resize();
    if (slow) { frame(); stop(); }          // one static render, then idle
    else { start(); }

    return { resize: resize, start: start, stop: stop, isStatic: slow };
  }

  function graphs() {
    var canvases = document.querySelectorAll('[data-graph]');
    if (!canvases.length) return;

    var all = Array.prototype.map.call(canvases, function (c) {
      return { el: c, api: makeGraph(c), visible: false };
    }).filter(function (g) { return g.api; });

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        all.forEach(function (g) { g.api.resize(); });
      }, 160);
    });

    // only paint what is on screen; several canvases otherwise add up
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var g = all.filter(function (x) { return x.el === e.target; })[0];
          if (!g) return;
          g.visible = e.isIntersecting;
          if (g.visible) g.api.start(); else g.api.stop();
        });
      }, { threshold: 0, rootMargin: '120px 0px' });
      all.forEach(function (g) { io.observe(g.el); });
    } else { all.forEach(function (g) { g.visible = true; }); }
    function syncMotion() {
      all.forEach(function (g) { if (g.visible && !slow && !document.hidden) g.api.start(); else g.api.stop(); });
    }
    motionPreference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
  }

  /* ---------------------------------------------------------
     2. The scroll rail.

     Three jobs, one rAF-throttled handler: reveal it once the
     hero is behind you, colour it for the ground it sits on,
     and mark which section you are in. Classes only -- the CSP
     blocks inline styles.
     --------------------------------------------------------- */

  function rail() {
    var el = document.getElementById('rail');
    if (!el) return;

    var ticks = Array.prototype.slice.call(el.querySelectorAll('.tick'));
    var darks = document.querySelectorAll('.is-dark');
    var hero = document.getElementById('hero');

    // pair each tick with its section, in document order
    var watched = ticks.map(function (t) {
      return { tick: t, section: document.getElementById(t.dataset.watch) };
    }).filter(function (w) { return w.section; });

    var ticking = false;
    var current = null;

    function apply() {
      ticking = false;
      var vh = window.innerHeight;

      // show the rail once the hero has mostly gone
      var heroGone = !hero || hero.getBoundingClientRect().bottom < vh * 0.55;
      el.classList.toggle('show', heroGone);

      // the rail sits at the vertical middle; sample the ground there
      var mid = vh / 2;
      var onDark = false;
      for (var i = 0; i < darks.length; i++) {
        var r = darks[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) { onDark = true; break; }
      }
      el.classList.toggle('on-dark', onDark);
      el.classList.toggle('on-light', !onDark);

      // active = the last watched section whose top has passed the line.
      // Document order makes nesting work: #omnia sits inside #experience,
      // so entering it simply wins over its parent.
      var line = vh * 0.42;
      var active = watched[0];
      for (var j = 0; j < watched.length; j++) {
        if (watched[j].section.getBoundingClientRect().top <= line) active = watched[j];
      }

      if (active && active.tick !== current) {
        if (current) {
          current.classList.remove('active');
          current.removeAttribute('aria-current');
        }
        active.tick.classList.add('active');
        // the rail is a nav; a screen reader should hear which tick is live
        active.tick.setAttribute('aria-current', 'true');
        current = active.tick;
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    apply();
  }

  /* ---------------------------------------------------------
     3. Park the hero.

     The field drift and the six twinkling strays are compositor
     work that carries on for the whole page once the hero has
     scrolled away. One class on <html> parks both.
     --------------------------------------------------------- */

  function heroIdle() {
    var hero = document.getElementById('hero');
    if (!hero || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      document.documentElement.classList.toggle('hero-off', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);
  }

  /* ---------------------------------------------------------
     4. Scroll reveal, staggered per batch.
     --------------------------------------------------------- */

  function reveals() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (e) { e.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; })
             .forEach(function (e, k) {
        var el = e.target;
        setTimeout(function () { el.classList.add('in'); }, Math.min(k, 5) * 85);
        io.unobserve(el);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    Array.prototype.forEach.call(els, function (e) { io.observe(e); });
  }

  /* ---------------------------------------------------------
     5. Stat counters — count up once, on entry.

     The markup already holds the final figure, so this only
     replaces a correct number with an animated one. Nothing to
     restore if it never runs.
     --------------------------------------------------------- */

  function counters() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;

    function render(el, v) {
      var dec = parseInt(el.dataset.dec || '0', 10);
      el.textContent = v.toFixed(dec) + (el.dataset.suffix || '');
    }

    function run(el) {
      var target = parseFloat(el.dataset.count);
      if (slow) { render(el, target); return; }
      var dur = 1500, t0 = null;
      function step(ts) {
        if (slow) { render(el, target); return; }
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        render(el, target * (1 - Math.pow(1 - p, 3)));   // easeOutCubic
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nums, function (el) {
        render(el, parseFloat(el.dataset.count));
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });

    Array.prototype.forEach.call(nums, function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------
     6. Beyond Work — the cards draw themselves.

     Every time the pointer arrives, the card builds a small
     scene and randomises it. Six generators, one palette.

     Why drawn and not photographed: the CSP is
     img-src 'self' data:, so a remote picture cannot load at
     all, and stock imagery of a gym carries a licence and says
     nothing. This costs no request and is different each time.

     Only presentation attributes are written here -- d, points,
     height, class. Those are attributes, not styles, so the
     missing style-src 'unsafe-inline' does not block them.
     An element.style write would be blocked, as ever.
     --------------------------------------------------------- */

  function hobbies() {
    var cards = document.querySelectorAll('[data-art]');
    if (!cards.length) return;

    var NS = 'http://www.w3.org/2000/svg';
    function mk(name, attrs) {
      var n = document.createElementNS(NS, name);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
      }
      return n;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
    function pick() { return arguments[ri(0, arguments.length - 1)]; }

    var SCENES = {

      /* a loaded bar, and the set you just did */
      crossfit: function (g) {
        g.appendChild(mk('rect', { x: 60, y: 66, width: 92, height: 6, rx: 3, 'class': 'hb-fill' }));
        var plates = ri(2, 4), i, h;
        for (i = 0; i < plates; i++) {
          h = 52 - i * 13;
          g.appendChild(mk('rect', { x: 56 - i * 12, y: 69 - h / 2, width: 9, height: h, rx: 3, 'class': 'hb-strong' }));
          g.appendChild(mk('rect', { x: 152 + i * 12, y: 69 - h / 2, width: 9, height: h, rx: 3, 'class': 'hb-strong' }));
        }
        for (i = 0; i < 9; i++) {
          h = rnd(8, 30);
          g.appendChild(mk('rect', { x: 66 + i * 10, y: 126 - h, width: 5, height: h, rx: 2.5, 'class': 'hb-soft' }));
        }
      },

      /* a microphone, and something being said into it */
      podcast: function (g) {
        g.appendChild(mk('rect', { x: 28, y: 52, width: 18, height: 34, rx: 9, 'class': 'hb-fill' }));
        g.appendChild(mk('path', { d: 'M21 82 a16 16 0 0 0 32 0', 'class': 'hb-line' }));
        g.appendChild(mk('path', { d: 'M37 98 v13 M27 111 h20', 'class': 'hb-line' }));
        for (var i = 0; i < 20; i++) {
          var h = rnd(8, 58);
          g.appendChild(mk('rect', {
            x: 62 + i * 7, y: 80 - h / 2, width: 4, height: h, rx: 2,
            'class': i % 3 ? 'hb-fill' : 'hb-strong'
          }));
        }
      },

      /* a route that goes nowhere in particular */
      walk: function (g) {
        var c;
        for (c = 0; c < 3; c++) {
          var y = 52 + c * 30;
          g.appendChild(mk('path', {
            d: 'M10 ' + y + ' q 44 ' + rnd(-16, -4) + ' 88 0 t 96 ' + rnd(2, 12),
            'class': 'hb-line hb-line--soft'
          }));
        }
        var pts = [], n = 7, i;
        for (i = 0; i < n; i++) {
          pts.push([24 + i * (152 / (n - 1)), 126 - i * (92 / (n - 1)) + rnd(-15, 15)]);
        }
        var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
        for (i = 1; i < n; i++) d += ' L' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
        g.appendChild(mk('path', { d: d, 'class': 'hb-line' }));
        g.appendChild(mk('circle', { cx: pts[0][0], cy: pts[0][1], r: 4, 'class': 'hb-strong' }));
        var e = pts[n - 1];
        g.appendChild(mk('path', {
          d: 'M' + e[0] + ' ' + (e[1] + 3) + ' l-6 -10 a7 7 0 1 1 12 0 z',
          'class': 'hb-strong'
        }));
      },

      /* whatever the hour called for */
      music: function (g) {
        for (var i = 0; i < 14; i++) {
          var h = rnd(10, 72);
          g.appendChild(mk('rect', {
            x: 40 + i * 11, y: 124 - h, width: 6, height: h, rx: 3,
            'class': i % 4 ? 'hb-fill' : 'hb-strong'
          }));
        }
        var nx = pick(120, 138, 152);
        g.appendChild(mk('circle', { cx: nx, cy: 34, r: 7, 'class': 'hb-strong' }));
        g.appendChild(mk('path', { d: 'M' + (nx + 7) + ' 34 v-20 h14', 'class': 'hb-line' }));
        g.appendChild(mk('circle', { cx: nx + 26, cy: 22, r: 5, 'class': 'hb-soft' }));
      },

      /* a sprite that has never existed before: four columns of
         random pixels, mirrored, the way the arcade did it */
      game: function (g) {
        var cols = 4, rows = 7, cell = 14, x0 = 44, y0 = 21, cx, cy, on;
        for (cy = 0; cy < rows; cy++) {
          for (cx = 0; cx < cols; cx++) {
            on = Math.random() > (cx === cols - 1 ? 0.35 : 0.5);
            if (!on) continue;
            var k = (cy + cx) % 5 === 0 ? 'hb-strong' : 'hb-fill';
            g.appendChild(mk('rect', {
              x: x0 + cx * cell, y: y0 + cy * cell, width: cell - 2, height: cell - 2, rx: 2, 'class': k
            }));
            if (cx < cols - 1) {
              g.appendChild(mk('rect', {
                x: x0 + (2 * cols - 2 - cx) * cell, y: y0 + cy * cell,
                width: cell - 2, height: cell - 2, rx: 2, 'class': k
              }));
            }
          }
        }
        for (var s = 0; s < 3; s++) {
          g.appendChild(mk('rect', {
            x: rnd(6, 34), y: rnd(26, 112), width: 6, height: 6, rx: 1.5, 'class': 'hb-soft'
          }));
        }
      },

      /* three of them, talking over each other */
      lang: function (g) {
        var b = [[92, 22, 88, 42], [50, 70, 78, 38], [108, 92, 74, 36]];
        for (var i = 0; i < b.length; i++) {
          var x = b[i][0], y = b[i][1], w = b[i][2], h = b[i][3];
          g.appendChild(mk('rect', {
            x: x, y: y, width: w, height: h, rx: h / 2.6,
            'class': i === 1 ? 'hb-fill' : 'hb-soft'
          }));
          g.appendChild(mk('path', {
            d: 'M' + (x + 16) + ' ' + (y + h) + ' l0 10 l12 -10 z',
            'class': i === 1 ? 'hb-fill' : 'hb-soft'
          }));
          var lines = ri(2, 3);
          for (var l = 0; l < lines; l++) {
            var ly = y + (h / (lines + 1)) * (l + 1);
            g.appendChild(mk('path', {
              d: 'M' + (x + 12) + ' ' + ly.toFixed(1) + ' h' + rnd(w * 0.34, w * 0.66).toFixed(1),
              'class': 'hb-line'
            }));
          }
        }
      }
    };

    function paint(host, kind) {
      var svg = mk('svg', {
        viewBox: '0 0 200 140',
        preserveAspectRatio: 'xMidYMid meet',
        'class': 'hobby__svg',
        'aria-hidden': 'true',
        focusable: 'false'
      });
      var g = mk('g', {});
      svg.appendChild(g);
      (SCENES[kind] || SCENES.crossfit)(g);
      host.textContent = '';
      host.appendChild(svg);
    }

    Array.prototype.forEach.call(cards, function (card) {
      var host = card.querySelector('.hobby__art');
      if (!host) return;
      var kind = card.dataset.art;
      var redraw = function () { paint(host, kind); };

      // Paint once now, not on first hover. The frame floats, so it has
      // to be in the flow from the start -- filling it later would
      // reflow the card's text under the pointer.
      redraw();

      card.addEventListener('mouseenter', redraw);
      card.addEventListener('focusin', redraw);
    });
  }

  /* ---------------------------------------------------------
     7. Disclosure housekeeping.

     Two things <details> does not do on its own.

     A link that lands on a collapsed panel -- a rail tick, a
     graph node, a pasted #hivebox URL -- would scroll to a
     closed box and look broken. Open it.

     And a closed panel does not print. On a CV page that
     matters more than usual, because printing it is the first
     thing a recruiter does, so everything opens before the
     print dialog and goes back afterwards.
     --------------------------------------------------------- */

  function disclosure() {
    var all = document.querySelectorAll('details');
    if (!all.length) return;

    function openAncestors(el) {
      // A role may live inside a closed company. Open every containing
      // disclosure so direct links reach visible content.
      while (el) {
        if (el.tagName === 'DETAILS') el.open = true;
        el = el.parentElement;
      }
    }

    function openTarget() {
      var id = location.hash.slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      openAncestors(el);
    }

    openTarget();
    window.addEventListener('hashchange', openTarget);

    // a tick and a graph node both point at an id already on screen,
    // so hashchange may not fire -- catch the click too
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) openAncestors(el);
    });

    var reclose = [];
    window.addEventListener('beforeprint', function () {
      reclose = [];
      Array.prototype.forEach.call(all, function (d) {
        if (!d.open) { reclose.push(d); d.open = true; }
      });
    });
    window.addEventListener('afterprint', function () {
      reclose.forEach(function (d) { d.open = false; });
      reclose = [];
    });
  }

  function platformOverview() {
    var scene = document.querySelector('.platform-scene');
    if (!scene) return;
    var systems = {
      infra: ['01', 'Infrastructure as code', 'Terraform', 'Gated Terraform pipelines. Auto-apply in DEV, manual approval into production.', 'approach', 'Explore my approach'],
      delivery: ['02', 'Guardrails for delivery', 'CI/CD', 'Pipelines, gateways, and guardrails that let teams ship safely. Explore my projects and the decisions behind them.', 'projects', 'Explore my projects'],
      observe: ['03', 'Find the real cause', 'Cloud logs', 'Correlation IDs, cloud logs, and execution plans. Trace the failure back to its source.', 'toolkit', 'Explore my toolkit'],
      experience: ['04', 'My experience', '5 roles', 'Five roles across Omnia Group and Yellowen. Explore the path from web development to DevOps.', 'experience', 'Explore my experience']
    };
    var buttons = scene.querySelectorAll('[data-system]');
    var detail = scene.querySelector('.system-detail');
    function select(key) {
      if (!systems[key]) return;
      var data = systems[key];
      scene.dataset.focus = key;
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.system === key));
      });
      scene.querySelector('.system-category').textContent = 'PORTFOLIO / ' + data[0];
      scene.querySelector('.system-title').textContent = data[1];
      scene.querySelector('.system-badge').textContent = data[2];
      scene.querySelector('.system-description').textContent = data[3];
      var link = scene.querySelector('.system-link');
      link.setAttribute('href', '#' + data[4]);
      link.firstChild.textContent = data[5] + ' ';
      // Restart a short appearance transition, without CSS style writes.
      detail.classList.remove('detail-enter');
      void detail.offsetWidth;
      detail.classList.add('detail-enter');
      scene.dispatchEvent(new CustomEvent('package-select', { detail: { key: key } }));
    }
    buttons.forEach(function (button) {
      button.disabled = false;
      button.addEventListener('click', function () { select(button.dataset.system); });
      function highlight() { scene.dataset.highlight = button.dataset.system; }
      function clearHighlight() { delete scene.dataset.highlight; }
      button.addEventListener('pointerenter', highlight);
      button.addEventListener('pointerleave', clearHighlight);
      button.addEventListener('focus', highlight);
      button.addEventListener('blur', clearHighlight);
    });
    detail.addEventListener('animationend', function () { detail.classList.remove('detail-enter'); });
  }

  /* --------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());

    platformOverview();
    graphs();
    rail();
    heroIdle();
    reveals();
    counters();
    hobbies();
    disclosure();
    // Enable enhancement-only CSS after all controls have initialized.
    // A failed script download leaves the content visible.
    document.documentElement.classList.add('js');
  });
})();
