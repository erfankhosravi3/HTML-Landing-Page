/* IronLog — MuscleMap: front/back anatomical SVG body with per-muscle heat. */
(function () {
  'use strict';

  const MuscleMap = {};

  /* Fallback labels (ExerciseDB.MUSCLE_LABEL is preferred, read lazily). */
  const LABELS = {
    chest: 'Chest', front_delts: 'Front Delts', side_delts: 'Side Delts',
    rear_delts: 'Rear Delts', traps: 'Traps', lats: 'Lats',
    upper_back: 'Upper Back', lower_back: 'Lower Back', biceps: 'Biceps',
    triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques',
    glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings',
    adductors: 'Adductors', calves: 'Calves'
  };

  function labelFor(id) {
    const db = window.ExerciseDB;
    return (db && db.MUSCLE_LABEL && db.MUSCLE_LABEL[id]) || LABELS[id] || id;
  }

  /* ---------- heat color ramp ----------
   * v <= 0 -> translucent white resting tint; otherwise a smooth RGB
   * interpolation through 4 green stops up to the brand accent.
   * The 0-anchor is the resting tint composited over the body base (#232935)
   * so the ramp fades in continuously. */
  const STOPS = [
    [0.00, [50, 56, 67]],    /* rgba(255,255,255,.07) over #232935 */
    [0.25, [26, 91, 48]],    /* #1a5b30 */
    [0.50, [34, 133, 67]],   /* #228543 */
    [0.75, [44, 163, 80]],   /* #2ca350 */
    [1.00, [48, 209, 88]]    /* #30d158 */
  ];

  MuscleMap.heatColor = function (v) {
    if (v === null || v === undefined || isNaN(v) || v <= 0) {
      return 'rgba(255,255,255,.07)';
    }
    v = Math.min(1, Math.max(0, v));
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        const v0 = STOPS[i - 1][0], c0 = STOPS[i - 1][1];
        const v1 = STOPS[i][0], c1 = STOPS[i][1];
        const t = (v - v0) / (v1 - v0);
        const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
        const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
        const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      }
    }
    return 'rgb(48,209,88)';
  };

  /* ---------- geometry ----------
   * Each figure lives in a 220x260 box, body centered on x=110.
   * Only the RIGHT half of every shape is authored; the left half is the
   * same path under transform="translate(220,0) scale(-1,1)".
   * The base silhouette is one filled half-outline (head to toe). */

  const BASE_HALF =
    'M110,7' +
    ' C117,7 122.5,13 122.5,22.5' +      /* skull */
    ' C122.5,30.5 119,37.5 114.5,40.5' + /* jaw */
    ' C114.8,44.5 115.5,47 116.5,49' +   /* neck */
    ' C125,50.5 136,52.5 143,57' +       /* trap slope to shoulder */
    ' C149.5,61.5 152.5,67 152.5,73' +   /* deltoid cap */
    ' C153,83 153.5,93 153.5,102' +      /* upper arm outer */
    ' C154.5,114 156.5,128 157.5,140' +  /* forearm outer */
    ' C158.5,147 158.5,153 156.5,158' +  /* wrist */
    ' C154.5,163.5 150,166 148,163.5' +  /* hand */
    ' C146.5,159.5 145.8,152 146,146' +  /* hand inner */
    ' C144.8,134 143.6,122 143,110' +    /* inner forearm */
    ' C141,100 139,88 138,79' +          /* inner elbow / upper arm */
    ' C137,75 135,73 133,72.5' +         /* armpit */
    ' C132.5,84 130,98 128.5,108' +      /* waist */
    ' C132.5,116 135,124 135.2,132' +    /* hip */
    ' C136.2,144 135,160 132.5,176' +    /* outer thigh */
    ' C131.2,184 130.5,190 130.5,196' +  /* knee */
    ' C133,202 134,212 132,222' +        /* calf outer */
    ' C130,232 127.5,238 126.5,243' +    /* ankle */
    ' C126.2,248 127.5,251 131,253.5' +  /* heel/foot */
    ' L114.5,253.5' +
    ' C113.5,249.5 113.5,245.5 114.2,242' + /* inner ankle */
    ' C115,232 114.2,220 114.2,210' +    /* inner calf */
    ' C113.3,202 113.4,196 114.2,190' +  /* inner knee */
    ' C113.2,176 112.2,160 111.4,146' +  /* inner thigh */
    ' C111,141 110.8,137 110.8,134' +    /* crotch */
    ' L110,131 L110,7 Z';

  const MIRROR = 'translate(220,0) scale(-1,1)';

  /* Front-view muscle regions (right-half path data). */
  const FRONT = [
    ['traps',
      'M113.8,43 C118.5,43.5 130,47 138.5,52.8 C130.5,54 121,53 114.8,51.4 C114.2,48.6 113.9,45.8 113.8,43 Z'],
    ['front_delts',
      'M138.2,58 C141.4,58.6 144.4,61.2 145.8,65 C146.4,69.8 144.8,74.6 142.2,77.8 C140.2,72 138.7,64.8 138.2,58 Z'],
    ['side_delts',
      'M140.6,55.4 C145.6,56.6 149.7,61 150.8,67 C151.3,72 149.5,77 146.8,80 C145.8,74.4 143.7,66 141,58.2 C140.8,57.2 140.7,56.3 140.6,55.4 Z'],
    ['chest',
      'M111.5,55.5 C118.5,54 130,55.6 136.2,60 C138.4,65 137.8,73 132.8,78.5 C126,82.4 115.5,81 111.5,78.8 Z'],
    ['biceps',
      'M139.2,81.5 C142,79.8 145.2,79.8 146.8,82 C147.9,88.8 147.4,97.4 145.4,104 C143.4,106.2 140.6,106.2 139.6,104 C138.5,96 138.6,88 139.2,81.5 Z'],
    ['forearms',
      'M143.2,109.5 C146,107.8 149.4,108.2 151,110.4 C153,118 154.6,129 155.2,138.4 C154.2,141.4 151,142 149.4,140.4 C146.8,130.6 144.6,119 143.2,109.5 Z'],
    ['abs',
      /* rectus half-column drawn as 4 stacked segments (classic six-pack grid) */
      'M111.6,84.5 C114.6,83.3 118.3,83.6 120.6,85.2 C120.9,88 121,91 120.9,94 C117.8,94.6 114.3,94.6 111.6,94.2 Z' +
      ' M111.6,95.9 C114.4,96.3 117.9,96.3 120.9,95.7 C120.8,98.9 120.6,102.2 120.2,105.4 C117.4,105.9 114.2,105.9 111.6,105.6 Z' +
      ' M111.6,107.3 C114.1,107.6 117.2,107.6 120,107.2 C119.5,110.5 118.9,113.8 118.1,116.9 C115.9,117.3 113.4,117.3 111.6,117.1 Z' +
      ' M111.6,118.8 C113.3,119 115.6,119 117.6,118.7 C116.5,123.2 114.4,127.4 112.4,129.3 C112.1,129.4 111.8,129.4 111.6,129.2 Z'],
    ['obliques',
      'M124,87.5 C127.4,86.6 130.4,86 132.2,85.6 C132.2,93.4 130.8,102 128.8,109 C127.2,113.4 125.2,115.6 123.3,116.6 C123.3,107.4 123.5,96.6 124,87.5 Z'],
    ['adductors',
      'M111.2,134.5 C113.8,133.2 116.6,133.6 118,135.6 C117,144 115.4,153 113.2,160.4 C112,155.6 111.2,146 111.2,134.5 Z'],
    ['quads',
      'M119.8,134.5 C126.4,132.4 132.2,134 134.2,138.2 C136,150 134.8,166 131,180.4 C129.2,186.4 125.6,190.2 121.8,190.4 C117.6,190.4 114.6,187 113.6,181.6 C112.6,176 112.8,169.6 114.6,164.8 C115.4,155 117,143 119.8,134.5 Z'],
    ['calves',
      /* tibialis ridge + medial calf visible from the front */
      'M114.8,197.6 C117.4,194.8 120,194.6 121.4,196.8 C122.2,206 121.6,217.4 119.6,226.8 C117.4,229.4 115.4,228 114.8,223.6 C113.8,214.4 114,204.6 114.8,197.6 Z' +
      ' M123.4,196.6 C126.2,194.2 128.8,194.8 130,198 C131.4,205.6 130.6,216 127.8,225 C125.8,228.6 123.2,228.2 122.6,224.8 C123.6,215.2 123.8,204.8 123.4,196.6 Z']
  ];

  /* Back-view muscle regions (right-half path data). */
  const BACK = [
    ['traps',
      'M110.8,42 C117,43 129,47 138,53.2 C132.2,55.4 124.4,56.5 119,57 C115,66 112.6,77 111.6,90 C111.3,90 111,90 110.8,90 Z'],
    ['rear_delts',
      'M139.6,58 C142.6,58.4 145.4,61 146.8,64.8 C147.3,69.6 145.7,74.5 143.1,77.7 C141.2,72 139.9,64.8 139.6,58 Z'],
    ['side_delts',
      'M141.8,55.8 C146.4,57 149.9,61.4 150.8,67.2 C151.2,72 149.5,76.8 147,79.8 C146,74.4 144.2,66.2 142,58.8 C141.9,57.8 141.8,56.8 141.8,55.8 Z'],
    ['upper_back',
      'M118.4,59 C124.6,57.4 131.8,58 135.8,61 C135.8,67 134,73.6 130.2,78.4 C125.6,80.6 120.4,79.6 117.4,76.6 C117,70.6 117.4,64.4 118.4,59 Z'],
    ['lats',
      'M114.8,80.5 C120.8,82.6 127.6,82.4 133.4,79.8 C135.6,85.4 134.4,93.4 131,100.6 C127.4,107.4 122.4,111.6 117.6,113 C116.4,102.8 114.6,90.6 114.8,80.5 Z'],
    ['lower_back',
      'M110.9,96.5 C112.8,96.3 114.6,98.2 115.2,100.8 C115.6,109.5 114.6,119.5 112.8,127 C112,128.6 111.3,129 110.9,128.4 Z'],
    ['triceps',
      'M139.4,80.5 C142.6,79 146.2,79.4 147.8,81.8 C148.9,89 148.4,98 146.4,105 C144.4,107.4 141.2,107.4 139.8,105 C138.7,97 138.8,87.5 139.4,80.5 Z'],
    ['forearms',
      'M143.2,109.5 C146,107.8 149.4,108.2 151,110.4 C153,118 154.6,129 155.2,138.4 C154.2,141.4 151,142 149.4,140.4 C146.8,130.6 144.6,119 143.2,109.5 Z'],
    ['glutes',
      'M111,130.5 C118,127.6 128,128.2 132.4,132.2 C134.4,138.2 133.8,146 129.8,151 C123.8,155 115.8,155 112,152 C110.9,145 110.6,137.4 111,130.5 Z'],
    ['hamstrings',
      'M113.2,158 C119,155.6 127,156 131.2,159 C132.8,168 131.8,178 129.4,188 C127.4,192.4 122,193 118.6,191 C115.6,184 113.6,171.6 113.2,158 Z'],
    ['calves',
      /* gastrocnemius, medial + lateral heads */
      'M114.6,197.5 C117.8,194.2 120.6,194.2 122,196.6 C122.8,206.4 122.2,218.4 119.8,228.2 C117.4,230.8 115.2,229.2 114.6,224.4 C113.6,214.8 113.8,204.6 114.6,197.5 Z' +
      ' M123.8,196.2 C126.8,193.8 129.6,194.6 130.8,198 C132.6,205.8 131.8,217.4 128.6,226.8 C126.4,230.6 123.8,230 123.2,226.2 C124.2,216.2 124.4,204.8 123.8,196.2 Z']
  ];

  const CSS =
    '.mm-root{width:100%;max-width:420px;margin:0 auto}' +
    '.mm-root svg{display:block;width:100%;height:auto}' +
    '.mm-root .mm-m{cursor:pointer;transition:filter .15s ease}' +
    '.mm-root .mm-m:hover{filter:brightness(1.5)}' +
    '.mm-root .mm-m:focus{outline:none}' +
    '.mm-root .mm-m:focus-visible{filter:brightness(1.5)}' +
    '.mm-root .mm-m:focus-visible path{stroke:#f2f5f7;stroke-width:1.2}' +
    '@media (prefers-reduced-motion: reduce){.mm-root .mm-m{transition:none}}';

  function ensureStyle() {
    if (document.getElementById('mm-style')) return;
    const st = document.createElement('style');
    st.id = 'mm-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function musclesMarkup(defs, values, selected) {
    let out = '';
    for (const def of defs) {
      const id = def[0];
      const d = def[1];
      const v = Math.min(1, Math.max(0, Number(values[id]) || 0));
      const fill = MuscleMap.heatColor(v);
      const label = labelFor(id);
      const pct = Math.round(v * 100);
      const sel = selected === id;
      const stroke = sel ? ' stroke="#f2f5f7" stroke-width="1.5" stroke-linejoin="round"' : '';
      out +=
        '<g class="mm-m" data-muscle="' + U.esc(id) + '" tabindex="0" role="button"' +
        ' aria-label="' + U.esc(label + ': ' + pct + '%') + '"' +
        ' fill="' + fill + '"' + stroke + '>' +
        '<title>' + U.esc(label + ' · ' + pct + '%') + '</title>' +
        '<path d="' + d + '"></path>' +
        '<path d="' + d + '" transform="' + MIRROR + '"></path>' +
        '</g>';
    }
    return out;
  }

  function figureMarkup(defs, values, selected, tx, caption) {
    return (
      '<g transform="translate(' + tx + ',0)">' +
      '<path d="' + BASE_HALF + '" fill="#232935"></path>' +
      '<path d="' + BASE_HALF + '" fill="#232935" transform="' + MIRROR + '"></path>' +
      musclesMarkup(defs, values, selected) +
      '<text x="110" y="271" text-anchor="middle" fill="var(--text-muted, #6b7683)"' +
      ' font-size="11" font-family="inherit">' + caption + '</text>' +
      '</g>'
    );
  }

  /* MuscleMap.render(el, {values:{muscleId:0..1}, onSelect?, selected?}) */
  MuscleMap.render = function (el, opts) {
    opts = opts || {};
    const values = opts.values || {};
    const onSelect = opts.onSelect;
    const selected = opts.selected || null;

    ensureStyle();
    el.innerHTML = '';

    const wrap = U.el(
      '<div class="mm-root">' +
      '<svg viewBox="0 0 440 278" role="group" aria-label="Muscle heat map, front and back view">' +
      figureMarkup(FRONT, values, selected, 0, 'Front') +
      figureMarkup(BACK, values, selected, 220, 'Back') +
      '</svg>' +
      '</div>'
    );

    function fire(m) {
      if (onSelect) onSelect(m.getAttribute('data-muscle'));
    }
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

  window.MuscleMap = MuscleMap;
})();
