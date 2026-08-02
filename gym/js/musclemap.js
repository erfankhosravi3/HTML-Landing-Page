/* IronLog — MuscleMap, "Field / Issued" redraw.
 * Drop-in replacement for gym/js/musclemap.js: same public surface
 * (MuscleMap.render(el, {values, selected, onSelect}), MuscleMap.heatColor(v)),
 * same 18 muscle ids, same .mm-root / .mm-m / data-muscle contract, so
 * views-insights.js and views-log.js need no change.
 *
 * WHAT CHANGED
 * The figure is drawn as an anatomical plate, not a silhouette with blobs on it.
 * Per figure, three stacked layers:
 *   1. BASE    the body in two closed pieces — torso+head+legs, and the arm —
 *              so the arm reads as a limb with a real armpit gap instead of a
 *              lobe fused to the ribcage;
 *   2. MUSCLE  per-group regions, most split into the heads they actually have
 *              (pec clavicular/sternal, biceps long/short, three quadriceps,
 *              two gastrocnemius heads + soleus, two hamstrings, serratus
 *              digitations). Every region carries a dark separation stroke, so
 *              neighbouring groups stay legible even one heat step apart;
 *   3. PLATE   bone hairlines owned by no muscle — clavicle, sternum, linea
 *              alba, spine, scapular borders, iliac crest, patella, achilles —
 *              plus a dashed centre axis and drawing-frame corner ticks.
 *
 * COLOUR
 * None of it lives here. The heat ramp, the body plate, the separation seam,
 * the hairline ink and the selection stroke are all read off the CSS custom
 * properties at render time (--heat-0..5, --plate, --seam, --border, --text),
 * so a per-profile theme moves the map without touching this file. Geometry is
 * universal, colour is theme — see "PALETTE" below and the P5 addendum.
 *
 * PROPORTION
 * Canonical 7.5-head figure. Authored in a 134-wide box on centre line x = 67,
 * then cropped to the 108 units that actually contain ink (CROP..CROP+PANE_W).
 * The old map spent ~55% of its box on empty margin and rendered the body at
 * 215px tall inside a 340px container; this one renders it at ~410px tall in
 * the same container. That is the whole reason it reads.
 */
(function () {
  'use strict';

  const MuscleMap = {};

  const LABELS = {
    chest: 'Chest', front_delts: 'Front Delts', side_delts: 'Side Delts',
    rear_delts: 'Rear Delts', traps: 'Traps', lats: 'Lats',
    upper_back: 'Upper Back', lower_back: 'Lower Back', biceps: 'Biceps',
    triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques',
    glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings',
    adductors: 'Adductors', calves: 'Calves'
  };

  function labelFor(id) {
    const db = (typeof window !== 'undefined') && window.ExerciseDB;
    return (db && db.MUSCLE_LABEL && db.MUSCLE_LABEL[id]) || LABELS[id] || id;
  }

  /* ======================================================================
     PALETTE — RESOLVED, NEVER FROZEN

     P5 rule (ARCHITECTURE.md, "COLOUR MUST NOT BE FROZEN IN JAVASCRIPT"): a
     colour captured into a JS constant cannot follow a theme, and this module
     used to capture eight of them. Every colour below is now read off the CSS
     custom properties on :root at RENDER TIME — never at module load, because
     the theme changes while the app is open — and cached only for the duration
     of one render pass (keyed on the theme marker, dropped when render()
     starts). The literals are FALLBACKS ONLY: they are the Field/Issued
     defaults, so a document with no stylesheet in reach (the node suites) and
     a base :root that has not yet grown --plate/--seam still paint a correct,
     complete map rather than nothing.

     Heat ramp — six stops at fixed positions, one hue family per theme with
     strictly increasing L*, so the scalar survives protanopia, deuteranopia
     and tritanopia on lightness alone. Stop 0 is the resting tint already
     composited over the plate, so "value 0" and "no data" render identically
     and the ramp stays continuous. The positions are geometry (universal); the
     colours are theme. --heat-0..5 are the SAME tokens the CSS legend gradient
     spends (§12 .muscle-legend .ramp), which is what keeps the legend honest:
     both sides read one source, so neither can drift from the other.
     ====================================================================== */

  const HEAT_TOKENS = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'];
  const LEVELS = [0.00, 0.20, 0.40, 0.60, 0.80, 1.00];

  const FALLBACK = {
    '--heat-0': '#222517',   /* ash — rgba(bone,.05) composited over the plate */
    '--heat-1': '#4a3c18',   /* ember  */
    '--heat-2': '#7d5615',   /* bronze */
    '--heat-3': '#ad6f14',   /* brass  */
    '--heat-4': '#dc8f22',   /* amber  */
    '--heat-5': '#ffb04a',   /* blaze  */
    '--plate': '#171a0e',    /* the unworked body plate                     */
    '--seam': '#0e1108',     /* separation stroke between two muscles       */
    '--border': 'rgba(233,222,190,.15)',  /* hairline/caption ink source    */
    '--text': '#f2efe3'      /* selection stroke                            */
  };

  /* Accepts #rgb / #rrggbb / rgb() / rgba() — a theme authors these, so this
     must not assume hex. Unparseable input falls back to the shipped literal. */
  function rgbOf(color, fallback) {
    const s = String(color || '').trim();
    if (s.charAt(0) === '#') {
      const h = s.slice(1);
      const f = h.length === 3
        ? h.split('').map(function (c) { return c + c; }).join('')
        : h;
      if (/^[0-9a-f]{6}$/i.test(f)) {
        return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
      }
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(function (p) { return p.length; });
      if (parts.length >= 3) {
        const v = parts.slice(0, 3).map(function (p) {
          return Math.round(p.indexOf('%') !== -1 ? parseFloat(p) * 2.55 : parseFloat(p));
        });
        if (v.every(function (n) { return isFinite(n); })) return v;
      }
    }
    return fallback ? rgbOf(fallback, null) : [0, 0, 0];
  }

  function readVar(name) {
    let v = '';
    try {
      if (typeof getComputedStyle === 'function' &&
          typeof document !== 'undefined' && document.documentElement) {
        v = getComputedStyle(document.documentElement).getPropertyValue(name);
      }
    } catch (e) { v = ''; }
    v = String(v || '').trim();
    return v || FALLBACK[name] || '';
  }

  let palCache = null;
  let palCacheKey = null;

  function themeSignature() {
    if (typeof document === 'undefined' || !document.documentElement) return '';
    return (document.documentElement.getAttribute('data-theme') || '') + '|' +
      (document.documentElement.className || '');
  }

  /* Drop the cache: called at the top of every render pass, and available to
     any theme switcher that changes the palette without touching data-theme. */
  MuscleMap.flushPalette = function () { palCache = null; palCacheKey = null; };

  function palette() {
    const sig = themeSignature();
    if (palCache && palCacheKey === sig) return palCache;
    const stops = HEAT_TOKENS.map(function (t, i) {
      return [LEVELS[i], rgbOf(readVar(t), FALLBACK[t])];
    });
    const bone = rgbOf(readVar('--border'), FALLBACK['--border']).join(',');
    palCache = {
      stops: stops,
      plate: readVar('--plate'),
      seam: readVar('--seam'),
      bone: bone,
      rest: 'rgba(' + bone + ',.05)',
      sel: readVar('--text')
    };
    palCacheKey = sig;
    return palCache;
  }

  /* The six ramp colours, live. Read by anything that draws a legend swatch,
     so it must resolve on access — a snapshot taken at module load would let
     the legend claim one ramp while the map paints another. */
  Object.defineProperty(MuscleMap, 'RAMP', {
    enumerable: true,
    configurable: true,
    get: function () {
      return palette().stops.map(function (s) {
        return 'rgb(' + s[1][0] + ',' + s[1][1] + ',' + s[1][2] + ')';
      });
    }
  });

  MuscleMap.heatColor = function (v) {
    const p = palette();
    const stops = p.stops;
    if (v === null || v === undefined || isNaN(v) || v <= 0) return p.rest;
    v = Math.min(1, Math.max(0, v));
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const v0 = stops[i - 1][0], c0 = stops[i - 1][1];
        const v1 = stops[i][0], c1 = stops[i][1];
        const t = (v - v0) / (v1 - v0);
        return 'rgb(' +
          Math.round(c0[0] + (c1[0] - c0[0]) * t) + ',' +
          Math.round(c0[1] + (c1[1] - c0[1]) * t) + ',' +
          Math.round(c0[2] + (c1[2] - c0[2]) * t) + ')';
      }
    }
    const top = stops[stops.length - 1][1];
    return 'rgb(' + top[0] + ',' + top[1] + ',' + top[2] + ')';
  };

  /* ======================================================================
     GEOMETRY — authoring box 134 wide, centre line x = 67, right half only.
     7.5-head canon, head unit 36.3. Vertical landmarks:
       7 skull · 43 chin · 63 acromion · 80 armpit/nipple · 116 navel+elbow
       143 crotch · 152 wrist · 176 fingertip · 205 knee · 265 ankle · 279 sole
     ====================================================================== */

  const CX = 67;
  const AUTHOR_W = 134;
  const MIRROR = 'translate(' + (AUTHOR_W) + ',0) scale(-1,1)';
  const CROP = 13;            /* left edge of the ink */
  const PANE_W = 108;         /* visible width per figure */
  const GAP = 10;
  const VB_W = PANE_W * 2 + GAP;   /* 226 */
  const VB_H = 298;
  const CAP_Y = 292;

  /* head + neck + torso + pelvis + leg, one closed half-outline */
  const TORSO =
    'M67,7' +
    'C75.2,7 79.4,13.6 79.4,22.4' +        /* skull */
    'C79.4,29.4 77.6,35 74.6,38.8' +       /* temple to the jaw angle */
    'C72.6,40.6 71.2,42.4 70.4,44' +       /* jawline to the chin */
    'L74.6,47.4' +                         /* tuck under the jaw — chin notch */
    'C75.6,49.6 76.2,51.4 76.4,53.2' +     /* neck, sternocleidomastoid */
    'C82.6,55.2 90.8,58.2 98,62.6' +       /* trapezius slope to acromion */
    'C95.6,68 94,74 93.4,80' +             /* lateral ribcage under the armpit */
    'C94.6,87 95.2,95 94.4,102' +          /* serratus / lat flare */
    'C93.4,110 91.6,119 90.6,128' +        /* waist */
    'C93,133 95.6,139 96,148' +            /* iliac crest / hip */
    'C97.4,159 96.6,173 94.6,187' +        /* outer thigh */
    'C93.2,195 92.2,200 91.6,205' +        /* knee */
    'C93.8,213 94.6,225 92.6,238' +        /* calf */
    'C90.4,249 86.6,258 84.6,265' +        /* shin / ankle */
    'C84,270 85.4,274.6 88.6,279' +        /* foot */
    'L74,279' +
    'C73.2,274.6 73.4,270 74,265' +        /* inner ankle */
    'C74.8,255 74.4,245 74,236' +          /* inner calf */
    'C72.6,223 72.2,213 72.4,205' +        /* inner knee */
    'C71.4,190 70.2,172 69.4,156' +        /* inner thigh */
    'C69,150 68.8,146 68.8,143' +          /* crotch */
    'L67,140 L67,7 Z';

  /* deltoid + upper arm + forearm + hand — abducted just enough for an armpit,
     fingertips at mid-thigh where they belong */
  const ARM =
    'M96.5,62' +
    'C101.6,60.6 106.6,63.4 108.6,69.4' +  /* deltoid cap */
    'C110.2,74.6 110.8,80.4 110.8,85.4' +
    'C111.4,93.4 111.8,101.4 112,109.6' +  /* upper arm, lateral */
    'C112.2,113.4 112,116 111.6,117.6' +   /* elbow */
    'C113,123.6 114.2,130.6 114.4,137.6' + /* brachioradialis */
    'C114.4,143.6 113.6,148.6 112.4,152.6' + /* wrist */
    'C115.2,157 116,164 114.6,170.4' +     /* hand */
    'C113,176.8 109,179 106,176.4' +
    'C104.4,173.4 104,169.4 104.2,165.2' +
    'C103.4,160.6 102.8,155.6 102.4,151' + /* inner forearm */
    'C101.2,144 100.2,135.4 99.4,127.4' +
    'C98.8,122.4 98.4,119 98,116' +        /* inner elbow */
    'C97.4,108 97,99 96.8,91' +            /* inner upper arm */
    'C96.6,84 96.4,77 96.2,71' +
    'C96.1,67 96.2,64 96.5,62 Z';

  /* ---------- FRONT muscle regions (right half) ---------- */
  const FRONT = [
    ['traps',
      'M74.8,52.4C82.4,55 90.6,58.2 97.8,62.6C91.6,65 84,64.8 78.4,62.8' +
      'C76.6,59.8 75.4,56.2 74.8,52.4Z'],
    ['front_delts',
      'M96.4,62.6C99.8,62.2 102.6,64.4 104,68.4C105,75.2 104,83 101.6,89' +
      'C99.2,85.2 97.4,78.6 97,71.4C96.8,68.2 96.6,65 96.4,62.6Z'],
    ['side_delts',
      'M103.2,62C107,63.2 109.8,66.6 111,72C111.8,79.4 110.6,87.6 107.8,93.4' +
      'C105.4,89.6 104,81.6 104.2,73.2C104.2,69.2 103.6,65 103.2,62Z'],
    ['chest',
      /* clavicular head */
      'M67.6,58.4C75.4,57.2 84,58.8 90.4,62.6C91.6,66.4 91,70.2 89.2,73.2' +
      'C82,71 74,70 67.6,70.2Z' +
      /* sternal head */
      'M67.6,72C74.2,71.8 82.4,73 89,75.2C89.2,80.6 86.8,85.8 82.6,89' +
      'C77.4,91 71.2,90.6 67.6,89.2Z'],
    ['biceps',
      /* long head */
      'M102.8,90.6C106,89 109,90 110.2,93.6C110.8,101 110,109 108,114.6' +
      'C105.8,117 103.2,116.2 102.4,112.8C101.6,105.4 101.8,96.8 102.8,90.6Z' +
      /* short head */
      'M98.6,91.4C100.4,90 102.2,90.6 102.6,93.2C101.8,100.2 101.8,107.6 102.4,113.8' +
      'C101.6,116.2 99.8,115.6 99,112.6C98.2,105.4 98.1,97.8 98.6,91.4Z'],
    ['forearms',
      /* brachioradialis + extensors */
      'M104.4,120.4C107.8,118.4 111,119.6 112.4,123.2C114,130.4 114.8,138.6 114.6,146.6' +
      'C114,151.6 111.6,152.8 109.8,150.6C107.6,140.6 105.8,130.4 104.4,120.4Z' +
      /* flexor mass */
      'M100.6,121C102.6,119.6 104.4,120.2 104.8,123C106.4,131.6 108,141.4 109.8,150' +
      'C109,152.8 107,153 105.8,150.6C103.6,141 101.6,130.6 100.6,121Z'],
    ['abs',
      /* rectus abdominis, four blocks per side, split by the inscriptions */
      'M67.4,92.6C71.4,92 75.4,93 77.6,95C78,98.4 78.1,101.8 77.9,105.2' +
      'C74,106 70.2,106 67.4,105.6Z' +
      'M67.4,107.4C70.8,108 74.8,108 77.8,107.2C77.7,111 77.4,114.8 77,118.2' +
      'C73.4,119 70,119 67.4,118.6Z' +
      'M67.4,120.4C70.2,120.9 73.6,120.9 76.8,120.2C76.3,124 75.7,127.6 75,130.8' +
      'C72.2,131.4 69.6,131.4 67.4,131Z' +
      'M67.4,133C69.8,133.4 72.4,133.4 74.6,132.8C73.8,137.4 72.4,140.6 70.8,142.6' +
      'C69.6,143.4 68.2,143.4 67.4,142.8Z'],
    ['obliques',
      /* external oblique slab */
      'M79.4,96C82.8,94.6 86.2,93 88.8,91.2C90.2,99.6 89.8,108.4 88,116.4' +
      'C86.6,122.6 84.4,127.2 81.8,129.6C80.6,118.4 79.8,107 79.4,96Z' +
      /* two serratus digitations */
      'M85.2,81.6C87.4,81 89.4,80.2 90.8,79.2C91,81.4 91,83.6 90.8,85.6' +
      'C88.8,86.8 86.6,87.6 84.8,88C85,85.8 85.1,83.6 85.2,81.6Z' +
      'M83.6,88.4C85.8,88 88.2,87.2 90.2,86.2C90,88.2 89.8,90.2 89.4,92' +
      'C87.4,93 85.2,93.6 83.4,94C83.5,92 83.5,90.2 83.6,88.4Z'],
    ['adductors',
      'M69.4,145.6C72.2,144.4 75.2,145.2 76.4,148C75.8,158.6 74.2,170 71.8,179.4' +
      'C70.8,183 70,182.8 69.8,179.4C69.4,168 69.2,155.6 69.4,145.6Z'],
    ['quads',
      /* vastus lateralis */
      'M85.4,149C90.4,146.8 94.6,148.8 96.2,153.8C97,164 96.2,175.4 93.4,185.4' +
      'C91.8,190.6 89.4,192.4 87.6,190.2C86.2,177 85.4,162.4 85.4,149Z' +
      /* rectus femoris */
      'M77.6,147.4C81.2,145.6 84.4,146.8 85.4,150.4C86.4,162.6 87.2,176.2 87,187.6' +
      'C85.8,192.6 82.8,194.2 80.4,191.8C78.6,178.8 77.8,161.8 77.6,147.4Z' +
      /* vastus medialis (the teardrop) */
      'M76.8,173C80.4,171.8 83.4,174 84.6,178.6C85.2,184.6 83.8,190.6 81,194' +
      'C78.6,195.6 76.6,193.8 76.1,189.4C75.6,183.6 75.9,177.6 76.8,173Z'],
    ['calves',
      /* tibialis anterior */
      'M85.2,208.6C88.8,207.2 91.8,209.2 92.7,213.8C93.4,222.4 92.3,233.4 89.6,242.6' +
      'C87.6,246.6 85.4,245.4 84.7,240.8C83.9,229.6 83.9,217.6 85.2,208.6Z' +
      /* medial gastrocnemius, seen from the front */
      'M75.4,208.6C79,207.2 82.2,209.2 83.1,213.8C83.7,221.6 82.6,230.8 80.4,237.2' +
      'C78.6,240.6 76.4,239.4 75.7,235C75,226.2 74.8,216 75.4,208.6Z']
  ];

  /* ---------- BACK muscle regions (right half) ---------- */
  const BACK = [
    ['traps',
      /* shoulder yoke */
      'M74.8,52.4C82.4,55 90.6,58.2 97.8,62.6C92,65.2 84.4,65 78.6,63' +
      'C76.8,59.8 75.4,56.2 74.8,52.4Z' +
      /* the spinal diamond, down to T12 */
      'M67.4,54.6C71.8,56.2 77,58.8 81.6,61.8C81.4,70.6 79.2,80.2 76,88.4' +
      'C73.6,94.8 70.6,99.8 67.4,102.6Z'],
    ['rear_delts',
      'M96.8,62.8C100.2,62.6 103,64.8 104.4,68.8C105.4,75.6 104.4,83.4 102,89.4' +
      'C99.6,85.6 97.8,78.8 97.4,71.6C97.2,68.4 97,65.2 96.8,62.8Z'],
    ['side_delts',
      'M103.4,62.2C107.2,63.4 110,66.8 111.2,72.2C112,79.6 110.8,87.8 108,93.6' +
      'C105.6,89.8 104.2,81.8 104.4,73.4C104.4,69.4 103.8,65.2 103.4,62.2Z'],
    ['upper_back',
      /* rhomboid / scapular field, between the trap diamond and the delt */
      'M82.4,63C86.6,64 90.4,65.8 93.2,68.2C94,74.6 93.2,81.6 91.4,87.4' +
      'C88,87 84.8,84.8 82.4,81.6C82.8,75.4 82.8,69 82.4,63Z'],
    ['lats',
      'M76,89.6C82,91.2 88,90.4 92.2,87.4C94.2,94.4 93.6,103.6 90.6,112.4' +
      'C87.4,121.2 81.8,127.4 75.4,130.2C74.2,117 74.4,102.6 76,89.6Z'],
    ['lower_back',
      /* erector spinae column */
      'M67.4,94.6C70.2,95.2 72.6,98 73.6,102.4C74.4,111.8 73.8,122.2 72,130.8' +
      'C70.4,136.4 68.8,138.8 67.4,138.4Z'],
    ['triceps',
      /* long head */
      'M98.4,90C101.6,88.6 104.2,89.6 105.2,93.2C104.8,101.6 104,109.6 102.6,115.6' +
      'C100.6,117.4 98.4,116.6 97.8,113C97.2,105.4 97.4,97 98.4,90Z' +
      /* lateral head */
      'M105.8,90.4C108.8,89 111.2,90.4 112.2,94.2C112.8,101.8 112,109.2 110.2,114.8' +
      'C108,117 105.6,116 104.8,112.6C104.4,105.2 104.8,97.2 105.8,90.4Z'],
    ['forearms',
      'M104.4,120.4C107.8,118.4 111,119.6 112.4,123.2C114,130.4 114.8,138.6 114.6,146.6' +
      'C114,151.6 111.6,152.8 109.8,150.6C107.6,140.6 105.8,130.4 104.4,120.4Z' +
      'M100.6,121C102.6,119.6 104.4,120.2 104.8,123C106.4,131.6 108,141.4 109.8,150' +
      'C109,152.8 107,153 105.8,150.6C103.6,141 101.6,130.6 100.6,121Z'],
    ['glutes',
      /* gluteus maximus */
      'M68.6,127.4C76.2,125.6 84.8,127.2 91,131.4C94.8,136.6 95,144.6 91.6,150.8' +
      'C86.2,156 77,156.8 70.6,153.6C68.6,145.6 68.2,135.4 68.6,127.4Z' +
      /* gluteus medius */
      'M86.6,124.6C90.8,126 94.2,129.2 95.4,134.2C95.8,138.4 94.6,142 92.2,143.8' +
      'C91.6,137.4 89.6,130.4 86.6,124.6Z'],
    ['hamstrings',
      /* biceps femoris */
      'M85.2,159.6C89.8,158.4 93.4,160.4 94.6,164.8C95,174 93.6,183.6 90.8,191.4' +
      'C89,195.4 86.6,196.4 85,193.6C84.2,182.6 84.4,170.6 85.2,159.6Z' +
      /* semitendinosus / semimembranosus */
      'M74,160.6C78.2,158.8 82.4,160 83.8,163.6C84,173.8 82.6,184.6 80,192.4' +
      'C78,196.4 75.6,196.4 74.4,193.2C73.4,182.4 73.2,171.2 74,160.6Z'],
    ['calves',
      /* lateral gastrocnemius */
      'M84.6,207.6C88.4,206.2 91.6,208.4 92.4,213.2C93,221 91.8,229.2 89.2,235' +
      'C87.2,238.4 85,237.2 84.4,232.8C83.8,224 83.8,214.8 84.6,207.6Z' +
      /* medial gastrocnemius */
      'M75.4,207.6C79.2,206 82.4,208.2 83.2,213.2C83.8,221.8 82.6,230.8 80.2,237.2' +
      'C78.2,240.6 76.2,239.6 75.4,235C74.6,226 74.6,215.2 75.4,207.6Z' +
      /* soleus, flanking the achilles */
      'M81.6,238.6C84,237.8 86,239.6 86.6,243.4C86.8,248.6 85.8,253.6 84.2,256.8' +
      'C82.8,258.8 81.6,257.8 81.4,254.6C81.4,249 81.4,242.8 81.6,238.6Z']
  ];

  /* ---------- plate hairlines, mirrored (limb landmarks) ---------- */
  const FRONT_LINES = [
    'M68.6,57C75.4,55.8 83.4,57.2 89.6,60.6',        /* clavicle */
    'M70.6,45.2C74,49 78.8,51.8 83.4,53.4',          /* sternocleidomastoid */
    'M76.6,134.6C82,138.6 87.2,141.6 91.6,143.2',    /* inguinal ligament */
    'M82.4,201.4C86,200 89.6,200.4 91.8,202.4',      /* patella */
    'M105.4,167.4C108.4,168.8 111.8,168.8 114.8,167.2', /* knuckle line */
    'M107.8,168.6C108.2,171.8 108.4,174.6 108.2,176.8', /* finger split */
    'M111.6,168.2C111.8,171.4 111.8,174.2 111.4,176.4',
    'M75.6,274.4C79.6,273.6 83.8,273.8 86.8,275'     /* toe line */
  ];
  const BACK_LINES = [
    'M78,63.4C81,71.2 82.6,78.4 83,85',              /* scapula, medial border */
    'M79,65.6C84,66.2 89.4,68 93.4,70.6',            /* scapular spine */
    'M73.4,124.4C80,124.8 86.8,126.6 91.6,129.6',    /* iliac crest */
    'M75.4,203.4C80,202 84.6,202 88.6,203.4',        /* popliteal crease */
    'M81.8,242.4C81.6,249 81.4,255 81.4,260',        /* achilles */
    'M75.2,272.6C79.2,271.8 83.4,272 86.4,273.2'     /* heel line */
  ];
  /* ---------- plate hairlines, NOT mirrored (midline) ---------- */
  const FRONT_MID = ['M67,60L67,90', 'M67,92L67,143'];   /* sternum, linea alba */
  const BACK_MID = ['M67,54L67,126', 'M67,128L67,155'];                     /* spine */

  /* ======================================================================
     MARKUP
     ====================================================================== */

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function musclesMarkup(defs, values, selected) {
    let out = '';
    for (const def of defs) {
      const id = def[0], d = def[1];
      const raw = Number(values[id]);
      const has = !(values[id] === null || values[id] === undefined || isNaN(raw));
      const v = has ? Math.min(1, Math.max(0, raw)) : 0;
      const fill = MuscleMap.heatColor(has ? v : null);
      const label = labelFor(id);
      const pct = Math.round(v * 100);
      out +=
        '<g class="mm-m' + (selected === id ? ' is-sel' : '') + '"' +
        ' data-muscle="' + esc(id) + '" tabindex="0" role="button"' +
        ' aria-label="' + esc(label + ': ' + (has ? pct + '%' : 'no data')) + '"' +
        ' fill="' + fill + '">' +
        '<title>' + esc(label + ' · ' + (has ? pct + '%' : 'no data')) + '</title>' +
        '<path d="' + d + '"></path>' +
        '<path d="' + d + '" transform="' + MIRROR + '"></path>' +
        '</g>';
    }
    return out;
  }

  function linesMarkup(mirrored, mid) {
    let out = '<g class="mm-plate">';
    for (const d of mirrored) {
      out += '<path d="' + d + '"></path>';
      out += '<path d="' + d + '" transform="' + MIRROR + '"></path>';
    }
    for (const d of mid) out += '<path d="' + d + '"></path>';
    return out + '</g>';
  }

  /* drawing-frame corner ticks — the "issued plate" tell, in pane coords */
  function ticksMarkup() {
    const L = 8, m = 1.5, W = PANE_W, H = 284;
    return '<g class="mm-tick">' +
      '<path d="M' + m + ',' + (m + L) + 'V' + m + 'H' + (m + L) + '"></path>' +
      '<path d="M' + (W - m - L) + ',' + m + 'H' + (W - m) + 'V' + (m + L) + '"></path>' +
      '<path d="M' + m + ',' + (H - L) + 'V' + H + 'H' + (m + L) + '"></path>' +
      '<path d="M' + (W - m - L) + ',' + H + 'H' + (W - m) + 'V' + (H - L) + '"></path>' +
      '</g>';
  }

  function figureMarkup(defs, lines, mid, values, selected, tx, caption) {
    return (
      '<g transform="translate(' + tx + ',0)">' +
      ticksMarkup() +
      '<g transform="translate(' + (-CROP) + ',0)">' +
      '<path class="mm-axis" d="M' + CX + ',10V276"></path>' +
      '<g class="mm-base">' +
      '<path d="' + TORSO + '"></path>' +
      '<path d="' + TORSO + '" transform="' + MIRROR + '"></path>' +
      '<path d="' + ARM + '"></path>' +
      '<path d="' + ARM + '" transform="' + MIRROR + '"></path>' +
      '</g>' +
      '<g class="mm-muscles">' + musclesMarkup(defs, values, selected) + '</g>' +
      linesMarkup(lines, mid) +
      '</g>' +
      '<text class="mm-cap" x="' + (PANE_W / 2) + '" y="' + CAP_Y + '" ' +
      'text-anchor="middle">' + caption + '</text>' +
      '</g>'
    );
  }

  MuscleMap.svgMarkup = function (values, selected) {
    values = values || {};
    return '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" role="group" ' +
      'aria-label="Muscle heat map, front and back view" ' +
      'xmlns="http://www.w3.org/2000/svg">' +
      figureMarkup(FRONT, FRONT_LINES, FRONT_MID, values, selected, 0, 'FRONT') +
      figureMarkup(BACK, BACK_LINES, BACK_MID, values, selected, PANE_W + GAP, 'BACK') +
      '</svg>';
  };

  /* ---------- styles ----------
     Geometry (every width, dash and radius) is universal; only the four
     colours are spent from the resolved palette, and the sheet is rewritten
     when the theme moves so the plate and the seam can never lag the fills. */
  function cssFor(p) {
    return [
      '.mm-root{width:100%;max-width:420px;margin:0 auto}',
      '.mm-root svg{display:block;width:100%;height:auto}',
      /* body plate */
      '.mm-root .mm-base path{fill:' + p.plate + ';stroke:rgba(' + p.bone + ',.24);',
      'stroke-width:.8;stroke-linejoin:round}',
      /* muscle regions — the dark seam is what keeps neighbours readable */
      '.mm-root .mm-muscles path{stroke:' + p.seam + ';stroke-width:.6;stroke-linejoin:round}',
      /* landmark hairlines */
      '.mm-root .mm-plate path{fill:none;stroke:rgba(' + p.bone + ',.32);stroke-width:.5;',
      'stroke-linecap:round;pointer-events:none}',
      '.mm-root .mm-axis{fill:none;stroke:rgba(' + p.bone + ',.10);stroke-width:.5;',
      'stroke-dasharray:2.5 4.5;pointer-events:none}',
      '.mm-root .mm-tick path{fill:none;stroke:rgba(' + p.bone + ',.22);stroke-width:.9;',
      'pointer-events:none}',
      '.mm-root .mm-cap{fill:rgba(' + p.bone + ',.55);font-size:8.5px;font-weight:700;',
      'letter-spacing:.24em;font-family:inherit}',
      /* interaction */
      '.mm-root .mm-m{cursor:pointer;transition:filter .15s ease}',
      '.mm-root .mm-m:hover{filter:brightness(1.45)}',
      '.mm-root .mm-m:focus{outline:none}',
      '.mm-root .mm-m:focus-visible{filter:brightness(1.45)}',
      '.mm-root .mm-m:focus-visible path,.mm-root .mm-m.is-sel path{',
      'stroke:' + p.sel + ';stroke-width:1.2}',
      '@media (prefers-reduced-motion: reduce){.mm-root .mm-m{transition:none}}'
    ].join('');
  }

  /* Back-compat: a live getter, so a caller that reads MuscleMap.CSS after a
     theme switch gets that theme's sheet instead of the one at module load. */
  Object.defineProperty(MuscleMap, 'CSS', {
    enumerable: true,
    configurable: true,
    get: function () { return cssFor(palette()); }
  });

  function ensureStyle(p) {
    const css = cssFor(p);
    let st = document.getElementById('mm-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'mm-style';
      document.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }

  /* MuscleMap.render(el, {values:{muscleId:0..1}, onSelect?, selected?}) */
  MuscleMap.render = function (el, opts) {
    opts = opts || {};
    const onSelect = opts.onSelect;
    MuscleMap.flushPalette();          /* start of a render pass — re-read the theme */
    ensureStyle(palette());
    el.innerHTML = '';

    const wrap = U.el('<div class="mm-root">' +
      MuscleMap.svgMarkup(opts.values || {}, opts.selected || null) + '</div>');

    function fire(m) { if (onSelect) onSelect(m.getAttribute('data-muscle')); }
    U.on(wrap, 'click', '.mm-m', function (e, m) { fire(m); });
    U.on(wrap, 'keydown', '.mm-m', function (e, m) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fire(m);
      }
    });

    el.appendChild(wrap);
    return wrap;
  };

  if (typeof window !== 'undefined') window.MuscleMap = MuscleMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = MuscleMap;
})();
