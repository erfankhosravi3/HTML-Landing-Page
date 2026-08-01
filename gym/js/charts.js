/* IronLog — Charts: hand-rolled responsive SVG chart library (zero deps).
   Every chart renders into a container element as an inline SVG (viewBox +
   width:100%) and re-renders on container resize. Dark theme only. */
(function () {
  'use strict';

  const Charts = {};

  /* Validated CVD-safe series order — the only colors data series may wear. */
  Charts.SERIES = ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc'];

  const SURFACE = '#1b1f26';            // card / chart surface
  const GRID = 'rgba(255,255,255,.06)'; // hairline gridlines
  const CROSS = 'rgba(255,255,255,.15)';// crosshair
  const GOAL = 'rgba(255,255,255,.18)'; // goal line
  const MUTED = '#6b7683';              // tick text
  const TEXT2 = '#98a2ae';              // secondary text / legend
  const EXTRA = '#5a6472';              // slot for series beyond the 6 (should be folded upstream)

  function seriesColor(i) {
    return i < Charts.SERIES.length ? Charts.SERIES[i] : EXTRA;
  }

  /* ---------- small helpers ---------- */

  const r2 = (v) => Math.round(v * 100) / 100;

  // crude but reliable width estimate for 11px system font
  function tw(s, size) { return String(s).length * (size || 11) * 0.62; }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  }

  function mixHex(a, b, t) { // t = weight of b
    const ra = hexToRgb(a), rb = hexToRgb(b);
    const m = ra.map((v, i) => Math.round(v + (rb[i] - v) * t));
    return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
  }

  function lightenHex(hex, f) { // push toward white by fraction f
    const c = hexToRgb(hex).map((v) => Math.round(v + (255 - v) * f));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // clean tick step: 1 / 2 / 2.5 / 5 * 10^n  (2.5 only at magnitude >= 10 so
  // default integer formatting never rounds a tick label onto its neighbor)
  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    let f;
    if (n <= 1) f = 1;
    else if (n <= 2) f = 2;
    else if (n <= 2.5 && mag >= 10) f = 2.5;
    else if (n <= 5) f = 5;
    else f = 10;
    return f * mag;
  }

  function makeTicks(min, max, count) {
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 1;
    if (max === min) max = min + 1;
    let step = niceStep((max - min) / Math.max(1, count));
    let lo = Math.floor(min / step + 1e-9) * step;
    let hi = Math.ceil(max / step - 1e-9) * step;
    let n = Math.round((hi - lo) / step);
    if (n > 5) { // keep 3-5 ticks
      step = niceStep((max - min) / 3);
      lo = Math.floor(min / step + 1e-9) * step;
      hi = Math.ceil(max / step - 1e-9) * step;
      n = Math.round((hi - lo) / step);
    }
    const out = [];
    for (let i = 0; i <= n; i++) out.push(Math.round((lo + i * step) * 1e6) / 1e6);
    return out;
  }

  // pick <= max evenly spaced indices from 0..n-1, always including first & last
  function thinIndices(n, max) {
    if (n <= max) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
    const out = [];
    const step = (n - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(Math.round(i * step));
    return out.filter((v, i, a) => a.indexOf(v) === i);
  }

  function contentWidth(el) {
    let w = el.clientWidth;
    if (w > 0) {
      const cs = getComputedStyle(el);
      w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return (w && w > 60) ? w : 640;
  }

  function reducedMotion() {
    return typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // render now; re-render (without entry animation) when the container resizes
  function responsive(el, draw) {
    Charts.tooltip.hide();
    draw(true);
    if (el.__chartRO) { el.__chartRO.disconnect(); el.__chartRO = null; }
    if (typeof ResizeObserver === 'undefined') return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(U.debounce(function () {
      if (!document.body.contains(el)) { ro.disconnect(); return; }
      const w = el.clientWidth;
      if (Math.abs(w - lastW) > 8) { lastW = w; Charts.tooltip.hide(); draw(false); }
    }, 120));
    ro.observe(el);
    el.__chartRO = ro;
  }

  function emptyState(el, h) {
    el.innerHTML = '<div style="height:' + h + 'px;display:flex;align-items:center;' +
      'justify-content:center;color:' + MUTED + ';font-size:12px;">No data yet</div>';
  }

  function svgOpen(w, h, extraStyle) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block;' +
      (extraStyle || '') + '" role="img">';
  }

  function txt(x, y, s, anchor, fill, size, weight) {
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" text-anchor="' + (anchor || 'start') +
      '" fill="' + (fill || MUTED) + '" font-size="' + (size || 11) + '"' +
      (weight ? ' font-weight="' + weight + '"' : '') + '>' + U.esc(s) + '</text>';
  }

  // legend row above / below the plot — text wears text tokens, never series color
  function legendHtml(items, center) {
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;' +
      (center ? 'justify-content:center;' : '') + 'margin:2px 2px 8px;">' +
      items.map(function (it) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;' +
          'color:' + TEXT2 + ';">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + it.color +
          ';flex:none;"></span>' + U.esc(it.label) + '</span>';
      }).join('') + '</div>';
  }

  /* ---------- shared tooltip singleton ---------- */

  Charts.tooltip = {
    el: null,
    ensure: function () {
      if (this.el && document.body.contains(this.el)) return this.el;
      const d = document.createElement('div');
      d.className = 'chart-tip';
      d.style.cssText = 'position:absolute;z-index:1000;pointer-events:none;display:none;' +
        'background:#232935;border:1px solid rgba(255,255,255,.1);border-radius:8px;' +
        'padding:6px 10px;font-size:12px;line-height:1.55;color:#f2f5f7;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:280px;white-space:nowrap;';
      document.body.appendChild(d);
      this.el = d;
      return d;
    },
    show: function (html, clientX, clientY) {
      const d = this.ensure();
      d.innerHTML = html;
      d.style.display = 'block';
      const r = d.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let x = clientX + 14;
      let y = clientY - r.height - 12;
      if (x + r.width + 6 > vw) x = clientX - r.width - 14;
      if (x < 6) x = 6;
      if (y < 6) y = clientY + 18;
      if (y + r.height + 6 > vh) y = Math.max(6, vh - r.height - 6);
      d.style.left = Math.round(x + window.scrollX) + 'px';
      d.style.top = Math.round(y + window.scrollY) + 'px';
    },
    hide: function () { if (this.el) this.el.style.display = 'none'; }
  };

  function tipHead(s) {
    return '<div style="color:' + TEXT2 + ';margin-bottom:3px;">' + U.esc(s) + '</div>';
  }

  function tipRow(color, label, value) {
    return '<div style="display:flex;align-items:center;gap:6px;">' +
      (color ? '<span style="width:8px;height:8px;border-radius:50%;background:' + color +
        ';flex:none;"></span>' : '') +
      (label ? '<span style="color:' + TEXT2 + ';">' + U.esc(label) + '</span>' : '') +
      '<span style="margin-left:auto;padding-left:12px;font-weight:600;">' +
      U.esc(value) + '</span></div>';
  }

  function evPoint(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  // hover + touch binding with a shared leave/hide
  function bindHover(node, move, leave) {
    node.addEventListener('mousemove', move);
    node.addEventListener('mouseleave', leave);
    node.addEventListener('touchstart', move, { passive: true });
    node.addEventListener('touchmove', move, { passive: true });
    node.addEventListener('touchend', leave);
    node.addEventListener('touchcancel', leave);
  }

  /* ---------- rounded-end bar paths (round on the DATA END only) ---------- */

  function topRoundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    const x2 = x + w, y0 = y + h;
    return 'M' + r2(x) + ',' + r2(y0) + ' L' + r2(x) + ',' + r2(y + r) +
      ' Q' + r2(x) + ',' + r2(y) + ' ' + r2(x + r) + ',' + r2(y) +
      ' L' + r2(x2 - r) + ',' + r2(y) +
      ' Q' + r2(x2) + ',' + r2(y) + ' ' + r2(x2) + ',' + r2(y + r) +
      ' L' + r2(x2) + ',' + r2(y0) + ' Z';
  }

  function rightRoundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w));
    const x2 = x + w, y2 = y + h;
    return 'M' + r2(x) + ',' + r2(y) + ' L' + r2(x2 - r) + ',' + r2(y) +
      ' Q' + r2(x2) + ',' + r2(y) + ' ' + r2(x2) + ',' + r2(y + r) +
      ' L' + r2(x2) + ',' + r2(y2 - r) +
      ' Q' + r2(x2) + ',' + r2(y2) + ' ' + r2(x2 - r) + ',' + r2(y2) +
      ' L' + r2(x) + ',' + r2(y2) + ' Z';
  }

  /* =========================== line =========================== */

  Charts.line = function (el, opts) {
    responsive(el, function () { renderLine(el, opts || {}); });
  };

  function renderLine(el, opts) {
    const H = 220;
    const yFmt = opts.yFmt || U.fmtNum;
    const series = (opts.series || []).map(function (s, i) {
      return {
        label: s.label || '',
        color: s.color || seriesColor(i),
        points: (s.points || []).filter(function (p) {
          return p && p.y !== null && p.y !== undefined && !isNaN(p.y);
        }).slice()
      };
    }).filter(function (s) { return true; });

    const allPts = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allPts.push(p); }); });
    if (!allPts.length) { emptyState(el, H); return; }

    const isDate = typeof allPts[0].x === 'string';
    const xv = function (x) { return isDate ? U.strToDate(x).getTime() : Number(x); };
    const xLabel = function (x) { return isDate ? U.fmtDate(x) : U.fmtNum(Number(x)); };
    series.forEach(function (s) {
      s.points.sort(function (a, b) { return xv(a.x) - xv(b.x); });
    });

    // unique sorted x values across all series (crosshair snap targets)
    const xmap = {};
    allPts.forEach(function (p) { xmap[xv(p.x)] = p.x; });
    const uxs = Object.keys(xmap).map(Number).sort(function (a, b) { return a - b; });

    let yMin = Infinity, yMax = -Infinity;
    allPts.forEach(function (p) { if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y; });
    if (opts.goalY !== undefined && opts.goalY !== null) {
      yMin = Math.min(yMin, opts.goalY); yMax = Math.max(yMax, opts.goalY);
    }
    if (yMin === yMax) { yMax = yMin + (Math.abs(yMin) || 1) * 0.1; yMin = yMin - (Math.abs(yMin) || 1) * 0.1; }
    if (yMin > 0 && yMin <= yMax * 0.45) yMin = 0;           // near-zero mins snap to zero
    else if (yMin > 0) yMin = yMin - (yMax - yMin) * 0.15;   // otherwise pad below

    const yTicks = makeTicks(yMin, yMax, 4);
    const yLo = yTicks[0], yHi = yTicks[yTicks.length - 1];

    const W = contentWidth(el);
    const maxTickW = Math.max.apply(null, yTicks.map(function (t) { return tw(yFmt(t)); }));
    const pad = { t: 14, r: 14, b: 24, l: Math.max(30, Math.ceil(maxTickW) + 12) };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    const x0 = uxs[0], x1 = uxs[uxs.length - 1];
    const X = function (t) {
      return x1 === x0 ? pad.l + pw / 2 : pad.l + ((t - x0) / (x1 - x0)) * pw;
    };
    const Y = function (v) { return pad.t + ((yHi - v) / (yHi - yLo)) * ph; };
    const baseY = pad.t + ph;

    let g = '';
    yTicks.forEach(function (t) {
      const y = Y(t);
      g += '<line x1="' + pad.l + '" y1="' + r2(y) + '" x2="' + (pad.l + pw) + '" y2="' + r2(y) +
        '" stroke="' + GRID + '" stroke-width="1"/>';
      g += txt(pad.l - 8, y + 3.5, yFmt(t), 'end');
    });

    // x tick labels — <= 6, first & last always, sized to the plot width
    const maxXT = U.clamp(Math.floor(pw / 72), 2, 6);
    thinIndices(uxs.length, maxXT).forEach(function (i) {
      const t = uxs[i];
      const anchor = i === 0 ? 'start' : (i === uxs.length - 1 ? 'end' : 'middle');
      let ax = X(t);
      if (uxs.length === 1) { /* single point: centered label */ }
      g += txt(ax, H - 7, xLabel(xmap[t]), uxs.length === 1 ? 'middle' : anchor);
    });

    // goal line — solid 1px hairline + small right-aligned muted label,
    // dodging series end markers so the label is never obscured
    if (opts.goalY !== undefined && opts.goalY !== null) {
      const gy = Y(opts.goalY);
      g += '<line x1="' + pad.l + '" y1="' + r2(gy) + '" x2="' + (pad.l + pw) + '" y2="' + r2(gy) +
        '" stroke="' + GOAL + '" stroke-width="1"/>';
      const glabel = 'goal ' + yFmt(opts.goalY);
      const gw = tw(glabel, 10);
      const ends = series.filter(function (s) { return s.points.length; }).map(function (s) {
        const p = s.points[s.points.length - 1];
        return { x: X(xv(p.x)), y: Y(p.y) };
      });
      let lx = pad.l + pw - 2;
      const hits = function (ly) {
        return ends.some(function (p) {
          return p.x > lx - gw - 8 && p.x < lx + 8 && p.y > ly - 13 && p.y < ly + 6;
        });
      };
      let ly = gy - 5;
      if (ly < pad.t + 9 || hits(ly)) {
        const below = gy + 13;
        if (below < pad.t + ph - 2 && !hits(below)) ly = below;
        else { // shift left of the colliding markers, stay above the line
          ly = Math.max(pad.t + 9, gy - 5);
          const minX = Math.min.apply(null, ends.map(function (p) { return p.x; }));
          lx = Math.max(pad.l + gw + 4, minX - 12);
        }
      }
      g += txt(lx, ly, glabel, 'end', MUTED, 10);
    }

    // area fills first (under all lines), then lines, then markers
    if (opts.area) {
      series.forEach(function (s) {
        if (s.points.length < 2) return;
        let d = '';
        s.points.forEach(function (p, i) {
          d += (i ? ' L' : 'M') + r2(X(xv(p.x))) + ',' + r2(Y(p.y));
        });
        d += ' L' + r2(X(xv(s.points[s.points.length - 1].x))) + ',' + r2(baseY) +
          ' L' + r2(X(xv(s.points[0].x))) + ',' + r2(baseY) + ' Z';
        g += '<path d="' + d + '" fill="' + s.color + '" fill-opacity=".1" stroke="none"/>';
      });
    }
    series.forEach(function (s) {
      if (s.points.length < 2) return;
      let d = '';
      s.points.forEach(function (p, i) {
        d += (i ? ' L' : 'M') + r2(X(xv(p.x))) + ',' + r2(Y(p.y));
      });
      g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2"' +
        ' stroke-linejoin="round" stroke-linecap="round"/>';
    });
    series.forEach(function (s) {
      if (!s.points.length) return;
      const p = s.points[s.points.length - 1];
      g += '<circle cx="' + r2(X(xv(p.x))) + '" cy="' + r2(Y(p.y)) + '" r="4.5" fill="' + s.color +
        '" stroke="' + SURFACE + '" stroke-width="2"/>';
    });

    // crosshair + hover dots (hidden until hover)
    g += '<line class="ch-x" x1="0" y1="' + pad.t + '" x2="0" y2="' + baseY +
      '" stroke="' + CROSS + '" stroke-width="1" style="display:none"/>';
    series.forEach(function (s, i) {
      g += '<circle class="ch-dot" data-s="' + i + '" r="3.5" fill="' + s.color +
        '" stroke="' + SURFACE + '" stroke-width="2" style="display:none"/>';
    });
    // full-plot hit target (>= 24px everywhere)
    g += '<rect x="' + pad.l + '" y="' + pad.t + '" width="' + r2(pw) + '" height="' + r2(ph) +
      '" fill="transparent"/>';

    el.innerHTML = legendHtml(series.filter(function (s) { return s.label; }).length >= 2 ?
      series.map(function (s) { return { label: s.label || '—', color: s.color }; }) : []) +
      svgOpen(W, H) + g + '</svg>';

    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.ch-x');
    const dots = U.$$('.ch-dot', svg);
    // per-x lookup: which series have a value there
    const byX = uxs.map(function (t) {
      const rows = [];
      series.forEach(function (s, si) {
        const p = s.points.find(function (q) { return xv(q.x) === t; });
        if (p) rows.push({ si: si, color: s.color, label: s.label, y: p.y });
      });
      return { t: t, px: X(t), label: isDate ? U.fmtDateLong(xmap[t]) : xLabel(xmap[t]), rows: rows };
    });

    bindHover(svg, function (e) {
      const p = evPoint(e);
      const rect = svg.getBoundingClientRect();
      const lx = (p.x - rect.left) * (W / rect.width);
      let best = byX[0], bd = Infinity;
      byX.forEach(function (c) {
        const d = Math.abs(c.px - lx);
        if (d < bd) { bd = d; best = c; }
      });
      cross.setAttribute('x1', r2(best.px));
      cross.setAttribute('x2', r2(best.px));
      cross.style.display = '';
      dots.forEach(function (d) { d.style.display = 'none'; });
      let html = tipHead(best.label);
      best.rows.forEach(function (row) {
        const d = dots[row.si];
        if (d) {
          d.setAttribute('cx', r2(best.px));
          d.setAttribute('cy', r2(Y(row.y)));
          d.style.display = '';
        }
        html += tipRow(row.color, series.length > 1 ? (row.label || '—') : '', yFmt(row.y));
      });
      Charts.tooltip.show(html, p.x, p.y);
    }, function () {
      cross.style.display = 'none';
      dots.forEach(function (d) { d.style.display = 'none'; });
      Charts.tooltip.hide();
    });
  }

  /* =========================== bars =========================== */

  Charts.bars = function (el, opts) {
    responsive(el, function () { renderBars(el, opts || {}); });
  };

  function renderBars(el, opts) {
    const data = (opts.data || []).map(function (d) {
      return { label: String(d.label === undefined ? '' : d.label), value: +d.value || 0, color: d.color || Charts.SERIES[0] };
    });
    if (!data.length) { emptyState(el, 200); return; }
    if (opts.horizontal) { renderBarsH(el, data, opts); return; }

    const H = 200;
    const yFmt = opts.yFmt || U.fmtNum;
    const W = contentWidth(el);
    const maxV = Math.max(1e-9, Math.max.apply(null, data.map(function (d) { return d.value; })));
    const yTicks = makeTicks(0, maxV, 4);
    const yHi = yTicks[yTicks.length - 1];
    const maxTickW = Math.max.apply(null, yTicks.map(function (t) { return tw(yFmt(t)); }));
    const pad = { t: 20, r: 8, b: 24, l: Math.max(30, Math.ceil(maxTickW) + 12) };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const baseY = pad.t + ph;
    const Y = function (v) { return pad.t + (1 - v / yHi) * ph; };

    let g = '';
    yTicks.forEach(function (t) {
      const y = Y(t);
      g += '<line x1="' + pad.l + '" y1="' + r2(y) + '" x2="' + (pad.l + pw) + '" y2="' + r2(y) +
        '" stroke="' + GRID + '" stroke-width="1"/>';
      g += txt(pad.l - 8, y + 3.5, yFmt(t), 'end');
    });

    const n = data.length;
    const slot = pw / n;
    const barW = Math.min(24, Math.max(3, slot - Math.max(2, slot * 0.35)));
    // value labels only where every one fits inside its slot without collisions
    const maxValW = Math.max.apply(null, data.map(function (d) { return tw(yFmt(d.value)); }));
    const showVals = maxValW <= slot - 4 && n <= 16;

    data.forEach(function (d, i) {
      const cx = pad.l + slot * i + slot / 2;
      const x = cx - barW / 2;
      const y = Y(d.value);
      const h = baseY - y;
      if (h > 0.5) g += '<path d="' + topRoundRect(x, y, barW, h, 4) + '" fill="' + d.color + '"/>';
      if (showVals && d.value > 0) g += txt(cx, y - 6, yFmt(d.value), 'middle', TEXT2);
    });

    const xIdx = thinIndices(n, U.clamp(Math.floor(pw / 76), 2, 6));
    xIdx.forEach(function (i) {
      const cx = pad.l + slot * i + slot / 2;
      let label = data[i].label;
      if (tw(label) > slot + 16) label = label.slice(0, Math.max(3, Math.floor((slot + 16) / 6.8))) + '…';
      g += txt(cx, H - 7, label, 'middle');
    });

    // widened invisible hit targets — full column per bar
    data.forEach(function (d, i) {
      g += '<rect class="hit" data-i="' + i + '" x="' + r2(pad.l + slot * i) + '" y="' + pad.t +
        '" width="' + r2(slot) + '" height="' + r2(ph) + '" fill="transparent"/>';
    });

    el.innerHTML = svgOpen(W, H) + g + '</svg>';
    bindBarTips(el, function (i) {
      return tipHead(data[i].label) + tipRow(data[i].color, '', yFmt(data[i].value));
    });
  }

  function renderBarsH(el, data, opts) {
    const yFmt = opts.yFmt || U.fmtNum;
    const W = contentWidth(el);
    const n = data.length;
    const rowH = 30;
    const maxV = Math.max(1e-9, Math.max.apply(null, data.map(function (d) { return d.value; })));
    const ticksArr = makeTicks(0, maxV, 4);
    const hi = ticksArr[ticksArr.length - 1];

    // category labels on the left — capped, truncated, never clipped
    const labMax = Math.min(120, Math.max.apply(null, data.map(function (d) { return tw(d.label); })) + 10);
    const maxValW = Math.max.apply(null, data.map(function (d) { return tw(yFmt(d.value)); }));
    const pad = { t: 8, r: Math.ceil(maxValW) + 14, b: 22, l: Math.ceil(labMax) + 8 };
    const H = pad.t + n * rowH + pad.b;
    const pw = W - pad.l - pad.r;
    const X = function (v) { return pad.l + (v / hi) * pw; };

    // gridlines at every tick; tick labels thinned so they never overlap
    const maxTLW = Math.max.apply(null, ticksArr.map(function (t) { return tw(yFmt(t)); }));
    let labelIdx = thinIndices(ticksArr.length, U.clamp(Math.floor(pw / (maxTLW + 16)), 2, 5));
    if (pw < maxTLW * 2 + 12) labelIdx = [ticksArr.length - 1]; // too tight for two labels
    let g = '';
    ticksArr.forEach(function (t, ti) {
      const x = X(t);
      g += '<line x1="' + r2(x) + '" y1="' + pad.t + '" x2="' + r2(x) + '" y2="' + (pad.t + n * rowH) +
        '" stroke="' + GRID + '" stroke-width="1"/>';
      if (labelIdx.indexOf(ti) !== -1) {
        g += txt(x, H - 6, yFmt(t), t === 0 ? 'start' : (ti === ticksArr.length - 1 ? 'end' : 'middle'));
      }
    });

    const barH = Math.min(24, rowH - 8);
    data.forEach(function (d, i) {
      const cy = pad.t + rowH * i + rowH / 2;
      let label = d.label;
      if (tw(label) > labMax) label = label.slice(0, Math.max(3, Math.floor(labMax / 6.8))) + '…';
      g += txt(pad.l - 8, cy + 3.5, label, 'end', TEXT2);
      const w = X(d.value) - pad.l;
      if (w > 0.5) {
        g += '<path d="' + rightRoundRect(pad.l, cy - barH / 2, w, barH, 4) + '" fill="' + d.color + '"/>';
      }
      g += txt(pad.l + Math.max(w, 0) + 6, cy + 3.5, yFmt(d.value), 'start', TEXT2);
      g += '<rect class="hit" data-i="' + i + '" x="0" y="' + r2(pad.t + rowH * i) +
        '" width="' + W + '" height="' + rowH + '" fill="transparent"/>';
    });

    el.innerHTML = svgOpen(W, H) + g + '</svg>';
    bindBarTips(el, function (i) {
      return tipHead(data[i].label) + tipRow(data[i].color, '', yFmt(data[i].value));
    });
  }

  function bindBarTips(el, htmlFor) {
    const svg = el.querySelector('svg');
    U.$$('.hit', svg).forEach(function (rect) {
      const i = +rect.getAttribute('data-i');
      const move = function (e) {
        const p = evPoint(e);
        Charts.tooltip.show(htmlFor(i), p.x, p.y);
      };
      bindHover(rect, move, function () { Charts.tooltip.hide(); });
    });
    svg.addEventListener('mouseleave', function () { Charts.tooltip.hide(); });
  }

  /* =========================== groupedBars =========================== */

  Charts.groupedBars = function (el, opts) {
    responsive(el, function () { renderGroupedBars(el, opts || {}); });
  };

  function renderGroupedBars(el, opts) {
    const groups = (opts.groups || []).map(function (gr) {
      return {
        label: String(gr.label === undefined ? '' : gr.label),
        values: (gr.values || []).map(function (v, i) {
          return { seriesLabel: v.seriesLabel || '', value: +v.value || 0, color: v.color || seriesColor(i) };
        })
      };
    });
    const H = 200;
    if (!groups.length || !groups.some(function (gr) { return gr.values.length; })) {
      emptyState(el, H); return;
    }
    const yFmt = opts.yFmt || U.fmtNum;
    const W = contentWidth(el);

    // legend from first occurrence of each series label
    const seen = {};
    const legend = [];
    groups.forEach(function (gr) {
      gr.values.forEach(function (v) {
        if (!seen[v.seriesLabel]) { seen[v.seriesLabel] = 1; legend.push({ label: v.seriesLabel, color: v.color }); }
      });
    });

    let maxV = 0;
    groups.forEach(function (gr) {
      gr.values.forEach(function (v) { if (v.value > maxV) maxV = v.value; });
    });
    maxV = Math.max(maxV, 1e-9);
    const yTicks = makeTicks(0, maxV, 4);
    const yHi = yTicks[yTicks.length - 1];
    const maxTickW = Math.max.apply(null, yTicks.map(function (t) { return tw(yFmt(t)); }));
    const pad = { t: 12, r: 8, b: 24, l: Math.max(30, Math.ceil(maxTickW) + 12) };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const baseY = pad.t + ph;
    const Y = function (v) { return pad.t + (1 - v / yHi) * ph; };

    let g = '';
    yTicks.forEach(function (t) {
      const y = Y(t);
      g += '<line x1="' + pad.l + '" y1="' + r2(y) + '" x2="' + (pad.l + pw) + '" y2="' + r2(y) +
        '" stroke="' + GRID + '" stroke-width="1"/>';
      g += txt(pad.l - 8, y + 3.5, yFmt(t), 'end');
    });

    const n = groups.length;
    const slot = pw / n;
    const innerN = Math.max.apply(null, groups.map(function (gr) { return gr.values.length; }));
    const barW = Math.min(24, Math.max(3, (slot * 0.72 - (innerN - 1) * 2) / innerN));
    const groupW = innerN * barW + (innerN - 1) * 2;

    groups.forEach(function (gr, gi) {
      const cx = pad.l + slot * gi + slot / 2;
      let x = cx - groupW / 2;
      gr.values.forEach(function (v) {
        const y = Y(v.value);
        const h = baseY - y;
        if (h > 0.5) g += '<path d="' + topRoundRect(x, y, barW, h, 4) + '" fill="' + v.color + '"/>';
        x += barW + 2; // 2px surface gap between adjacent bars
      });
    });

    thinIndices(n, U.clamp(Math.floor(pw / 76), 2, 6)).forEach(function (i) {
      const cx = pad.l + slot * i + slot / 2;
      let label = groups[i].label;
      if (tw(label) > slot + 16) label = label.slice(0, Math.max(3, Math.floor((slot + 16) / 6.8))) + '…';
      g += txt(cx, H - 7, label, 'middle');
    });

    groups.forEach(function (gr, gi) {
      g += '<rect class="hit" data-i="' + gi + '" x="' + r2(pad.l + slot * gi) + '" y="' + pad.t +
        '" width="' + r2(slot) + '" height="' + r2(ph) + '" fill="transparent"/>';
    });

    el.innerHTML = legendHtml(legend.length >= 2 ? legend : []) + svgOpen(W, H) + g + '</svg>';
    bindBarTips(el, function (gi) {
      let html = tipHead(groups[gi].label);
      groups[gi].values.forEach(function (v) {
        html += tipRow(v.color, v.seriesLabel, yFmt(v.value));
      });
      return html;
    });
  }

  /* =========================== heatCalendar =========================== */

  Charts.heatCalendar = function (el, opts) {
    responsive(el, function () { renderHeat(el, opts || {}); });
  };

  function renderHeat(el, opts) {
    const values = opts.values || {};
    const weeks = Math.max(1, opts.weeks || 26);
    const color = opts.color || Charts.SERIES[0];
    const bright = color.toLowerCase() === '#2ca350' ? '#30d158' : lightenHex(color, 0.22);
    // 5-step ramp: surface hairline -> color -> brightened color
    const ramp = [
      GRID,
      mixHex(SURFACE, color, 0.35),
      mixHex(SURFACE, color, 0.65),
      color,
      bright
    ];

    const today = U.todayStr();
    const startMon = U.addDays(U.weekStart(today), -7 * (weeks - 1));

    // quantile thresholds over nonzero values
    const nz = [];
    for (const k in values) { if (values[k] > 0) nz.push(values[k]); }
    nz.sort(function (a, b) { return a - b; });
    const q = function (p) { return nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 0; };
    const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    const level = function (v) {
      if (!v || v <= 0) return 0;
      if (v <= q1) return 1;
      if (v <= q2) return 2;
      if (v <= q3) return 3;
      return 4;
    };

    const W = contentWidth(el);
    const labelW = 32, padT = 18;
    const gap = 2;
    const cs = U.clamp(Math.floor((W - labelW) / weeks) - gap, 7, 15);
    const step = cs + gap;
    // center the grid horizontally when the card is wider than the grid
    const padL = labelW + Math.max(0, Math.floor((W - labelW - weeks * step + gap) / 2));
    const H = padT + 7 * step + 4;

    let g = '';
    const cellDates = []; // [col][row] -> dateStr | null
    let prevMonth = -1, lastLabelCol = -3;
    for (let col = 0; col < weeks; col++) {
      const monday = U.addDays(startMon, col * 7);
      const m = U.strToDate(monday).getMonth();
      if (m !== prevMonth) {
        if (col - lastLabelCol >= 3) {
          g += txt(padL + col * step, 11, U.fmtDate(monday).split(' ')[0], 'start', MUTED, 10);
          lastLabelCol = col;
        }
        prevMonth = m;
      }
      const colDates = [];
      for (let row = 0; row < 7; row++) {
        const date = U.addDays(monday, row);
        if (date > today) { colDates.push(null); continue; } // future days invisible
        colDates.push(date);
        const v = values[date] || 0;
        g += '<rect x="' + (padL + col * step) + '" y="' + (padT + row * step) +
          '" width="' + cs + '" height="' + cs + '" rx="2" fill="' + ramp[level(v)] + '"/>';
      }
      cellDates.push(colDates);
    }
    ['Mon', 'Wed', 'Fri'].forEach(function (lbl, i) {
      const row = i * 2;
      g += txt(padL - 6, padT + row * step + cs * 0.78, lbl, 'end', MUTED, 10);
    });

    el.innerHTML = svgOpen(W, H) + g + '</svg>';
    const svg = el.querySelector('svg');
    bindHover(svg, function (e) {
      const p = evPoint(e);
      const rect = svg.getBoundingClientRect();
      const sx = (p.x - rect.left) * (W / rect.width);
      const sy = (p.y - rect.top) * (H / rect.height);
      const col = Math.floor((sx - padL) / step);
      const row = Math.floor((sy - padT) / step);
      const date = (cellDates[col] || [])[row];
      if (col < 0 || row < 0 || row > 6 || !date) { Charts.tooltip.hide(); return; }
      const v = values[date] || 0;
      Charts.tooltip.show(tipHead(U.fmtDateLong(date)) +
        tipRow(v > 0 ? ramp[level(v)] : MUTED, '', U.fmtNum(v)), p.x, p.y);
    }, function () { Charts.tooltip.hide(); });
  }

  /* =========================== rings =========================== */

  Charts.rings = function (el, opts) {
    responsive(el, function (first) { renderRings(el, opts || {}, first); });
  };

  function renderRings(el, opts, animate) {
    const rings = (opts.rings || []).map(function (rg, i) {
      return {
        value: +rg.value || 0,
        goal: +rg.goal || 0,
        color: rg.color || seriesColor(i),
        label: rg.label || ''
      };
    });
    if (!rings.length) { emptyState(el, 150); return; }

    const size = 150;
    const n = rings.length;
    const sw = n <= 3 ? 14 : Math.max(7, Math.floor((size / 2 - 22) / n) - 3);
    const gap = 3;
    const cx = size / 2, cy = size / 2;
    const r0 = size / 2 - sw / 2 - 2;

    let g = '';
    const anim = []; // {sel, target}
    rings.forEach(function (rg, i) {
      const r = r0 - i * (sw + gap);
      if (r < sw / 2 + 2) return;
      const C = 2 * Math.PI * r;
      const pct = rg.goal > 0 ? rg.value / rg.goal : 0;
      const base = Math.min(pct, 1);
      const extra = U.clamp(pct - 1, 0, 0.999); // overflow lap drawn on top
      // track: same hue at 12% opacity
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(r) + '" fill="none" stroke="' + rg.color +
        '" stroke-opacity=".12" stroke-width="' + sw + '"/>';
      g += '<circle class="ring-p" data-i="' + i + '" cx="' + cx + '" cy="' + cy + '" r="' + r2(r) +
        '" fill="none" stroke="' + rg.color + '" stroke-width="' + sw + '" stroke-linecap="round"' +
        ' stroke-dasharray="' + r2(C) + '" stroke-dashoffset="' + r2(C) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      anim.push({ cls: '.ring-p[data-i="' + i + '"]', target: C * (1 - base), delay: i * 120 });
      if (extra > 0.01) {
        g += '<circle class="ring-o" data-i="' + i + '" cx="' + cx + '" cy="' + cy + '" r="' + r2(r) +
          '" fill="none" stroke="' + lightenHex(rg.color, 0.22) + '" stroke-width="' + sw +
          '" stroke-linecap="round" stroke-dasharray="' + r2(C) + '" stroke-dashoffset="' + r2(C) +
          '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
        anim.push({ cls: '.ring-o[data-i="' + i + '"]', target: C * (1 - extra), delay: i * 120 + 500 });
      }
    });

    // no center content — legend below carries labels + values
    const legend = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;' +
      'margin-top:8px;">' + rings.map(function (rg) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;' +
          'color:' + TEXT2 + ';">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + rg.color + ';flex:none;"></span>' +
          U.esc(rg.label) + ' <b style="color:#f2f5f7;font-weight:600;">' + U.esc(U.fmtNum(rg.value)) +
          '</b><span style="color:' + MUTED + ';">/' + U.esc(U.fmtNum(rg.goal)) + '</span></span>';
      }).join('') + '</div>';

    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size +
      '" style="display:block;" role="img">' + g + '</svg>' + legend + '</div>';

    const svg = el.querySelector('svg');
    const instant = !animate || reducedMotion();
    anim.forEach(function (a) {
      const c = svg.querySelector(a.cls);
      if (!c) return;
      if (instant) { c.setAttribute('stroke-dashoffset', r2(a.target)); return; }
      c.style.transition = 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1) ' + a.delay + 'ms';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { c.style.strokeDashoffset = r2(a.target); });
      });
    });
  }

  /* =========================== spark =========================== */

  Charts.spark = function (el, opts) {
    responsive(el, function () { renderSpark(el, opts || {}); });
  };

  function renderSpark(el, opts) {
    const H = 36;
    const color = opts.color || Charts.SERIES[0];
    const points = (opts.points || []).filter(function (p) {
      return p && p.y !== null && p.y !== undefined && !isNaN(p.y);
    }).slice();
    if (!points.length) {
      el.innerHTML = '<div style="height:' + H + 'px;display:flex;align-items:center;' +
        'color:' + MUTED + ';font-size:11px;">No data yet</div>';
      return;
    }
    const isDate = typeof points[0].x === 'string';
    const xv = function (x) { return isDate ? U.strToDate(x).getTime() : Number(x); };
    points.sort(function (a, b) { return xv(a.x) - xv(b.x); });

    const W = contentWidth(el);
    const pad = 4;
    let yMin = Infinity, yMax = -Infinity;
    points.forEach(function (p) { if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y; });
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const x0 = xv(points[0].x), x1 = xv(points[points.length - 1].x);
    const X = function (t) { return x1 === x0 ? W / 2 : pad + ((t - x0) / (x1 - x0)) * (W - pad * 2); };
    const Y = function (v) { return pad + ((yMax - v) / (yMax - yMin)) * (H - pad * 2); };

    let g = '';
    if (points.length > 1) {
      let d = '';
      points.forEach(function (p, i) {
        d += (i ? ' L' : 'M') + r2(X(xv(p.x))) + ',' + r2(Y(p.y));
      });
      g += '<path d="' + d + ' L' + r2(X(x1)) + ',' + (H - 1) + ' L' + r2(X(x0)) + ',' + (H - 1) +
        ' Z" fill="' + color + '" fill-opacity=".1" stroke="none"/>';
      g += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"' +
        ' stroke-linejoin="round" stroke-linecap="round"/>';
    }
    const last = points[points.length - 1];
    g += '<circle cx="' + r2(X(xv(last.x))) + '" cy="' + r2(Y(last.y)) + '" r="3" fill="' + color +
      '" stroke="' + SURFACE + '" stroke-width="2"/>';

    el.innerHTML = svgOpen(W, H) + g + '</svg>';
  }

  /* =========================== donut =========================== */

  Charts.donut = function (el, opts) {
    responsive(el, function () { renderDonut(el, opts || {}); });
  };

  function renderDonut(el, opts) {
    const slices = (opts.slices || []).map(function (s, i) {
      return { label: s.label || '', value: Math.max(0, +s.value || 0), color: s.color || seriesColor(i) };
    });
    const total = U.sum(slices, function (s) { return s.value; });
    if (!slices.length || total <= 0) { emptyState(el, 180); return; }

    const size = 160;
    const cx = size / 2, cy = size / 2;
    const R = size / 2 - 4;
    const hole = 0.62;
    const rIn = R * hole;
    const nonzero = slices.filter(function (s) { return s.value > 0; });

    let g = '';
    if (nonzero.length === 1) {
      // full ring — no gaps needed
      const mid = (R + rIn) / 2;
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(mid) + '" fill="none" stroke="' +
        nonzero[0].color + '" stroke-width="' + r2(R - rIn) + '" class="slice" data-i="' +
        slices.indexOf(nonzero[0]) + '" style="cursor:default"/>';
    } else {
      let a = -Math.PI / 2;
      slices.forEach(function (s, i) {
        if (s.value <= 0) return;
        const a2 = a + (s.value / total) * Math.PI * 2;
        const large = a2 - a > Math.PI ? 1 : 0;
        const p = function (r, ang) { return r2(cx + r * Math.cos(ang)) + ',' + r2(cy + r * Math.sin(ang)); };
        // 2px surface-color stroke creates the gaps between slices
        g += '<path class="slice" data-i="' + i + '" d="M' + p(R, a) +
          ' A' + r2(R) + ' ' + r2(R) + ' 0 ' + large + ' 1 ' + p(R, a2) +
          ' L' + p(rIn, a2) +
          ' A' + r2(rIn) + ' ' + r2(rIn) + ' 0 ' + large + ' 0 ' + p(rIn, a) +
          ' Z" fill="' + s.color + '" stroke="' + SURFACE + '" stroke-width="2" stroke-linejoin="round"/>';
        a = a2;
      });
    }

    const legend = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;' +
      'margin-top:10px;">' + slices.map(function (s) {
        return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;' +
          'color:' + TEXT2 + ';">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + s.color + ';flex:none;"></span>' +
          U.esc(s.label) + ' <span style="color:' + MUTED + ';">' + U.esc(U.fmtNum(s.value)) + '</span></span>';
      }).join('') + '</div>';

    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size +
      '" style="display:block;" role="img">' + g + '</svg>' + legend + '</div>';

    const svg = el.querySelector('svg');
    const yFmt = opts.yFmt || U.fmtNum;
    U.$$('.slice', svg).forEach(function (path) {
      const s = slices[+path.getAttribute('data-i')];
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      const move = function (e) {
        const p = evPoint(e);
        Charts.tooltip.show(tipHead(s.label) + tipRow(s.color, '', yFmt(s.value) + ' · ' + pct + '%'), p.x, p.y);
      };
      bindHover(path, move, function () { Charts.tooltip.hide(); });
    });
    svg.addEventListener('mouseleave', function () { Charts.tooltip.hide(); });
  }

  window.Charts = Charts;
})();
