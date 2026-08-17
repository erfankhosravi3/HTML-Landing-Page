/* IronLog — nutrition engine (P8).
   Two halves, deliberately separated:

   THE PHOTO LOOP — a meal photo goes to the API (the user's own key, the
   same on-device key the coach uses) and comes back as a STRUCTURED DRAFT:
   items with calories and macros, every field editable, nothing saved until
   the user accepts. The model has no write path — the P6 contract, verbatim.
   The photo itself is never stored anywhere: it is downscaled in a canvas,
   sent, and dropped. A single photo is ten times the size of the entire
   database; the blob protocol would choke on it, and a food diary that keeps
   photos is a surveillance archive nobody asked for.

   THE ARITHMETIC — totals, energy balance (intake vs the burn the health
   link already delivers), the weight-trend calibration that makes imprecise
   per-meal estimates into a trustworthy weekly signal, and the deficit flag.
   All pure, all refusing to speak when the data can't fund the claim, same
   as the Goals engine.

   Manual entry is first-class: everything except analyzePhoto works with no
   key and no network. */
(function () {
  'use strict';

  const U = window.U;
  const Nutrition = {};

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2023-06-01';
  const MODEL = 'claude-opus-5';

  /* ---------- thresholds (the spec, in one place) ---------- */

  Nutrition.KCAL_PER_KG = 7700;      // energy density of body-mass change
  Nutrition.CALIB_WINDOW = 21;       // days the calibration looks back
  Nutrition.CALIB_MIN_DAYS = 14;     // complete days required before it speaks
  Nutrition.DEFICIT_FLAG_KCAL = 750; // avg daily deficit that starts the flag
  Nutrition.DEFICIT_WINDOW = 14;     // sustained over this many days
  Nutrition.DEFICIT_MIN_SESSIONS = 8;// with at least this much training in it
  Nutrition.PROTEIN_G_PER_KG = 1.8;  // default target; user-editable

  /* ---------- the wire ----------
     Every object in the schema carries additionalProperties:false — the P6
     lesson, learned in production: the API rejects the whole request without
     it, auth happens before validation, and no stub can catch it. So the
     schema is pinned byte-for-byte by tests/nutrition-core.js. */

  Nutrition.MEAL_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'confidence', 'items'],
    properties: {
      reply: { type: 'string', description: 'One short sentence about the meal.' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'portion', 'kcal', 'proteinG', 'carbsG', 'fatG'],
          properties: {
            name: { type: 'string' },
            portion: { type: 'string', description: 'Estimated portion, e.g. "1.5 cups".' },
            kcal: { type: 'number' },
            proteinG: { type: 'number' },
            carbsG: { type: 'number' },
            fatG: { type: 'number' }
          }
        }
      }
    }
  };

  const CHARTER =
    'You estimate the nutritional content of ONE meal from a photo, for a ' +
    'private training log. Rules: estimate every distinct food as its own ' +
    'item with a stated portion; give kcal, protein, carbs and fat per item; ' +
    'be honest about uncertainty via the confidence field (oils, sauces and ' +
    'hidden ingredients make photos genuinely uncertain — say low when low); ' +
    'never lecture about diet, never advise, never comment on the person. ' +
    'If the image is not food, return zero items and say so in the reply. ' +
    'If a user note contradicts the photo, the note wins — the human was there.';

  // Small and bounded (one image in, ~400 tokens out), so this request does
  // NOT stream — the P6 streaming rationale was a 200KB dossier, not this.
  Nutrition.buildRequest = function (imageBase64, mediaType, note) {
    const content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: note ? 'Note from the person eating it: ' + note : 'Estimate this meal.' }
    ];
    return {
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: CHARTER }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: Nutrition.MEAL_SCHEMA } },
      messages: [{ role: 'user', content: content }]
    };
  };

  /* Parse a reply into a draft. NEVER throws; a draft with ok:false and a
     reason is the failure mode, because a meal you can't log is an annoyance
     and an exception at dinner time is a bug report. */
  Nutrition.parseReply = function (json) {
    try {
      if (!json || typeof json !== 'object') return { ok: false, reason: 'Empty reply' };
      if (json.stop_reason === 'refusal') {
        return { ok: false, reason: 'The model declined to analyze this image.' };
      }
      let text = '';
      (json.content || []).forEach(function (b) {
        if (b && b.type === 'text' && typeof b.text === 'string') text += b.text;
      });
      const data = JSON.parse(text);
      const items = Array.isArray(data.items) ? data.items.filter(function (it) {
        return it && typeof it === 'object' && isFinite(Number(it.kcal));
      }).map(function (it) {
        return { name: String(it.name || 'Item'), portion: String(it.portion || ''),
          kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
          proteinG: Math.max(0, Math.round(Number(it.proteinG) || 0)),
          carbsG: Math.max(0, Math.round(Number(it.carbsG) || 0)),
          fatG: Math.max(0, Math.round(Number(it.fatG) || 0)) };
      }) : [];
      return { ok: true, reply: String(data.reply || ''),
        confidence: ['low', 'medium', 'high'].indexOf(data.confidence) >= 0 ? data.confidence : 'low',
        items: items };
    } catch (e) {
      return { ok: false, reason: 'Could not read the reply.' };
    }
  };

  /* The photo call. Key comes from the same place the coach keeps it —
     on-device, never in state, never synced. */
  Nutrition.analyzePhoto = function (imageBase64, mediaType, note) {
    const Coach = window.Coach;
    const key = Coach && Coach.getKey ? Coach.getKey() : '';
    if (!key) return Promise.resolve({ ok: false, reason: 'No API key. Add one in Settings → AI Coach.' });
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, reason: 'No network available.' });
    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(Nutrition.buildRequest(imageBase64, mediaType, note))
    }).then(function (res) {
      return res.text().then(function (text) {
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        if (!res.ok) {
          const m = json && json.error && json.error.message ? json.error.message : ('HTTP ' + res.status);
          return { ok: false, reason: res.status === 401 ? 'The API key was rejected. Check it in Settings.' : m };
        }
        return Nutrition.parseReply(json);
      });
    }).catch(function (e) {
      return { ok: false, reason: 'Could not reach the API. (' + String((e && e.message) || e) + ')' };
    });
  };

  /* ---------- arithmetic ---------- */

  Nutrition.totals = function (meals) {
    const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: (meals || []).length };
    (meals || []).forEach(function (m) {
      t.kcal += Number(m.kcal) || 0;
      t.proteinG += Number(m.proteinG) || 0;
      t.carbsG += Number(m.carbsG) || 0;
      t.fatG += Number(m.fatG) || 0;
    });
    return t;
  };

  Nutrition.itemTotals = function (items) {
    const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    (items || []).forEach(function (it) {
      t.kcal += Number(it.kcal) || 0;
      t.proteinG += Number(it.proteinG) || 0;
      t.carbsG += Number(it.carbsG) || 0;
      t.fatG += Number(it.fatG) || 0;
    });
    return t;
  };

  /* Burn for one day, from what the health link delivered. Basal + active
     when both exist; null when either is missing — a burn number that
     silently means "half your burn" would poison every balance it touches. */
  Nutrition.dayBurn = function (samples, userId, date) {
    let basal = null, active = null;
    (samples || []).forEach(function (s) {
      if (!s || s.userId !== userId || s.date !== date) return;
      if (s.kind === 'basalEnergyKcal') basal = Number(s.value) || 0;
      if (s.kind === 'activeEnergyKcal') active = Number(s.value) || 0;
    });
    if (basal === null || active === null) return { burn: null, basal: basal, active: active };
    return { burn: Math.round(basal + active), basal: basal, active: active };
  };

  /* A day is COMPLETE when it has logged intake and a full burn. Balance and
     calibration only ever stand on complete days. */
  Nutrition.dayLedger = function (meals, samples, userId, date) {
    const dayMeals = (meals || []).filter(function (m) {
      return m.userId === userId && m.date === date;
    });
    const intake = Nutrition.totals(dayMeals);
    const burn = Nutrition.dayBurn(samples, userId, date);
    return { date: date, intake: intake, burn: burn.burn,
      complete: dayMeals.length > 0 && burn.burn !== null,
      balance: dayMeals.length > 0 && burn.burn !== null ? intake.kcal - burn.burn : null };
  };

  /* The calibration: over the trailing window, compare the weight change the
     ledger PREDICTS with the change the scale REPORTS. The gap, spread per
     day, is how far the estimates run — and the honest correction to show.
     Refuses below CALIB_MIN_DAYS complete days or without two weights. */
  Nutrition.calibration = function (meals, samples, weights, userId, today) {
    const ledgers = [];
    for (let i = 0; i < Nutrition.CALIB_WINDOW; i++) {
      const d = U.addDays(today, -i);
      const led = Nutrition.dayLedger(meals, samples, userId, d);
      if (led.complete) ledgers.push(led);
    }
    if (ledgers.length < Nutrition.CALIB_MIN_DAYS) {
      return { state: 'insufficient', completeDays: ledgers.length,
        needed: Nutrition.CALIB_MIN_DAYS };
    }
    const ws = (weights || []).filter(function (w) {
      return w.userId === userId && typeof w.date === 'string' &&
        isFinite(Number(w.value)) &&
        w.date >= U.addDays(today, -Nutrition.CALIB_WINDOW) && w.date <= today;
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (ws.length < 2) return { state: 'insufficient', completeDays: ledgers.length, weights: ws.length };

    const spanDays = Math.max(1, Math.round(
      (U.strToDate(ws[ws.length - 1].date) - U.strToDate(ws[0].date)) / 86400000));
    const actualDeltaKg = Number(ws[ws.length - 1].value) - Number(ws[0].value);
    let sum = 0;
    ledgers.forEach(function (l) { sum += l.balance; });
    const avgBalance = sum / ledgers.length;
    const predictedDeltaKg = (avgBalance * spanDays) / Nutrition.KCAL_PER_KG;
    const gapKcalPerDay = Math.round(
      ((actualDeltaKg - predictedDeltaKg) * Nutrition.KCAL_PER_KG) / spanDays);

    return { state: 'ok', completeDays: ledgers.length,
      avgBalance: Math.round(avgBalance),
      predictedDeltaKg: Math.round(predictedDeltaKg * 100) / 100,
      actualDeltaKg: Math.round(actualDeltaKg * 100) / 100,
      correctionKcalPerDay: gapKcalPerDay,
      correctedAvgBalance: Math.round(avgBalance + gapKcalPerDay) };
  };

  /* The deficit flag. A sustained large deficit while training hard is an
     injury and performance risk — same family as the ruck-ramp guardrail,
     and like every guardrail it has no override and no opinion about looks.
     Speaks only on complete days; silence when the data is thin. */
  Nutrition.deficitFlag = function (meals, samples, workouts, userId, today) {
    const ledgers = [];
    for (let i = 0; i < Nutrition.DEFICIT_WINDOW; i++) {
      const led = Nutrition.dayLedger(meals, samples, userId, U.addDays(today, -i));
      if (led.complete) ledgers.push(led);
    }
    if (ledgers.length < 7) return { state: 'quiet', completeDays: ledgers.length };
    let sum = 0;
    ledgers.forEach(function (l) { sum += l.balance; });
    const avg = sum / ledgers.length;
    const from = U.addDays(today, -Nutrition.DEFICIT_WINDOW);
    const sessions = (workouts || []).filter(function (w) {
      return w.userId === userId && typeof w.date === 'string' &&
        w.date >= from && w.date <= today;
    }).length;
    if (avg <= -Nutrition.DEFICIT_FLAG_KCAL && sessions >= Nutrition.DEFICIT_MIN_SESSIONS) {
      return { state: 'flag', avgDeficit: Math.round(-avg), sessions: sessions,
        completeDays: ledgers.length };
    }
    return { state: 'ok', avgBalance: Math.round(avg), sessions: sessions,
      completeDays: ledgers.length };
  };

  /* Default protein target from the latest known weight; null when no weight
     is known — an invented default would be a number the app can't defend. */
  Nutrition.proteinTargetG = function (weights, userId) {
    const ws = (weights || []).filter(function (w) {
      return w.userId === userId && isFinite(Number(w.value));
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!ws.length) return null;
    return Math.round(Number(ws[ws.length - 1].value) * Nutrition.PROTEIN_G_PER_KG);
  };

  window.Nutrition = Nutrition;
})();
/* ======================================================================
   P8.1 — the diary machinery: slots, the budget, the week, the library
   ====================================================================== */
(function () {
  'use strict';
  const U = window.U;
  const Nutrition = window.Nutrition;

  Nutrition.SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  Nutrition.SLOT_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

  // Default slot from the clock — a suggestion the user can override, never
  // a claim about what the meal "was".
  Nutrition.slotFor = function (hour) {
    if (hour < 10) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 21) return 'dinner';
    return 'snack';
  };

  // A logged meal without a slot (P8.0 records) reads as a snack — rendered,
  // counted, never guessed into a mealtime it may not have been.
  Nutrition.slotOf = function (meal) {
    return Nutrition.SLOTS.indexOf(meal && meal.slot) >= 0 ? meal.slot : 'snack';
  };

  Nutrition.TDEE_WINDOW = 14;     // days the burn average looks back
  Nutrition.TDEE_MIN_DAYS = 5;    // complete burn days before a target exists

  /* The daily calorie target, MyFitnessPal-shaped but honest about where the
     number comes from: TDEE is the average of REAL burn days from the health
     link (never an age/height formula), and the goal rate moves it by
     7700 kcal per kg per week. No burn history -> no target, said plainly. */
  Nutrition.kcalTarget = function (samples, userId, today, cfg) {
    cfg = cfg || {};
    if (isFinite(Number(cfg.kcalOverride)) && Number(cfg.kcalOverride) > 0) {
      return { state: 'ok', target: Math.round(Number(cfg.kcalOverride)), source: 'manual' };
    }
    let sum = 0, n = 0;
    for (let i = 0; i < Nutrition.TDEE_WINDOW; i++) {
      const b = Nutrition.dayBurn(samples, userId, U.addDays(today, -i));
      if (b.burn !== null) { sum += b.burn; n++; }
    }
    if (n < Nutrition.TDEE_MIN_DAYS) {
      return { state: 'insufficient', burnDays: n, needed: Nutrition.TDEE_MIN_DAYS };
    }
    const tdee = sum / n;
    const rate = Number(cfg.rateKgPerWeek) || 0;   // negative = cut
    const target = Math.round(tdee + (rate * Nutrition.KCAL_PER_KG) / 7);
    return { state: 'ok', target: target, tdee: Math.round(tdee), rate: rate, source: 'burn' };
  };

  /* Seven days for the week strip: intake, burn, balance, completeness.
     Incomplete days carry their intake but NO balance — the strip renders
     what happened, never a number the data can't fund. */
  Nutrition.weekSeries = function (meals, samples, userId, today) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = U.addDays(today, -i);
      out.push(Nutrition.dayLedger(meals, samples, userId, d));
    }
    return out;
  };

  // The library's order: what you use most, then what you used last.
  Nutrition.rankFoods = function (foods) {
    return (foods || []).slice().sort(function (a, b) {
      const ub = (Number(b.uses) || 0) - (Number(a.uses) || 0);
      if (ub !== 0) return ub;
      return (Number(b.lastUsedAt) || 0) - (Number(a.lastUsedAt) || 0);
    });
  };

  // Meals may be logged to any past day (dietary recall is normal); the
  // future stays closed. Distinct from the tick law on purpose.
  Nutrition.canLogOn = function (date, today) {
    return typeof date === 'string' && date <= today;
  };
})();
/* ======================================================================
   P8.2 — ENERGY: exercise and health data joined into one ledger
   ====================================================================== */
(function () {
  'use strict';
  const U = window.U;
  const Nutrition = window.Nutrition;

  Nutrition.ENERGY_WINDOW = 14;   // the chart and the split look back this far
  Nutrition.SPLIT_MIN_DAYS = 3;   // complete days of EACH kind before the split speaks

  /* One row per day, newest last: intake, burn (with its basal/active parts),
     balance on complete days only, and whether training was LOGGED that day.
     'trained' comes from the workout log — the app's own record — never
     inferred from calorie numbers. */
  Nutrition.energySeries = function (meals, samples, workouts, userId, today, days) {
    const n = days || Nutrition.ENERGY_WINDOW;
    const trainedOn = {};
    (workouts || []).forEach(function (w) {
      if (w && w.userId === userId && typeof w.date === 'string') trainedOn[w.date] = true;
    });
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = U.addDays(today, -i);
      const led = Nutrition.dayLedger(meals, samples, userId, d);
      const burn = Nutrition.dayBurn(samples, userId, d);
      out.push({ date: d, intake: led.intake, burn: led.burn,
        basal: burn.basal, active: burn.active,
        balance: led.balance, complete: led.complete,
        trained: !!trainedOn[d] });
    }
    return out;
  };

  /* The split that answers the question every training log + food diary
     combination exists to answer: WHERE DOES THE DEFICIT LIVE? Averages over
     complete days only, split by trained/rest, refusing until both sides
     have SPLIT_MIN_DAYS — a comparison with two data points on one side is
     an anecdote wearing a chart. */
  Nutrition.trainingSplit = function (series) {
    const train = { burn: 0, intake: 0, balance: 0, n: 0 };
    const rest = { burn: 0, intake: 0, balance: 0, n: 0 };
    (series || []).forEach(function (day) {
      if (!day.complete) return;
      const side = day.trained ? train : rest;
      side.burn += day.burn;
      side.intake += day.intake.kcal;
      side.balance += day.balance;
      side.n++;
    });
    if (train.n < Nutrition.SPLIT_MIN_DAYS || rest.n < Nutrition.SPLIT_MIN_DAYS) {
      return { state: 'insufficient', trainDays: train.n, restDays: rest.n,
        needed: Nutrition.SPLIT_MIN_DAYS };
    }
    function avg(s) {
      return { burn: Math.round(s.burn / s.n), intake: Math.round(s.intake / s.n),
        balance: Math.round(s.balance / s.n), n: s.n };
    }
    const a = avg(train), b = avg(rest);
    return { state: 'ok', train: a, rest: b,
      deltaBurn: a.burn - b.burn,
      deltaIntake: a.intake - b.intake,
      deltaBalance: a.balance - b.balance };
  };
})();
