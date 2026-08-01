/* IronLog — AppleHealth: Apple Health export.zip/export.xml import + workout CSV export.
   ZIP reading is a minimal central-directory reader (stored + deflate via
   DecompressionStream). XML parsing is streaming (TextDecoder chunks + regex over
   complete <Record>/<Workout> elements) — export files can be hundreds of MB. */
(function () {
  'use strict';

  const AppleHealth = {};

  const PROGRESS_STEP = 2 * 1024 * 1024; // report every ~2MB
  const KJ_PER_KCAL = 4.184;

  /* ---------- text helpers ---------- */

  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, function (all, e) {
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      const code = e[1] === 'x' || e[1] === 'X'
        ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : all;
    });
  }

  const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g;

  function parseAttrs(openTag) {
    const out = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(openTag))) out[m[1]] = decodeEntities(m[2]);
    return out;
  }

  // Apple dates look like '2026-06-14 07:30:00 -0700'. The date portion is
  // already local to where it was recorded — take it verbatim, never shift TZ.
  function datePart(s) {
    if (!s) return '';
    const d = String(s).split(' ')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  }

  // '2026-06-14 07:30:00 -0700' -> epoch ms. Explicit math — Date.parse handling
  // of '-0700'-style offsets is engine-dependent.
  const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?/;
  function parseHKTime(s) {
    const m = TS_RE.exec(String(s || '').trim());
    if (!m) return null;
    let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (m[7]) {
      const off = (+m[8] * 60 + +m[9]) * 60000;
      t += m[7] === '-' ? off : -off;
    }
    return t;
  }

  // 'HKWorkoutActivityTypeTraditionalStrengthTraining' -> 'Traditional Strength Training'
  function friendlyActivity(t) {
    let s = String(t || '').replace(/^HKWorkoutActivityType/, '');
    if (!s) return '';
    s = s
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return s;
  }

  function energyToKcal(v, unit) {
    const u = String(unit || '').toLowerCase();
    if (u === 'kj') return v / KJ_PER_KCAL;
    if (u === 'j') return v / (KJ_PER_KCAL * 1000);
    return v; // 'Cal' / 'kcal' / unknown -> already kcal
  }

  /* ---------- minimal ZIP reader ---------- */

  function bytesOf(blob) {
    return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  async function openZipExportXml(file) {
    if (file.size < 22) throw new Error('Not a valid ZIP archive (file too small).');

    // End Of Central Directory: scan backwards through a possible comment tail.
    const tailLen = Math.min(file.size, 22 + 65535);
    const tail = await bytesOf(file.slice(file.size - tailLen, file.size));
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Not a valid ZIP archive (end-of-central-directory record not found).');
    const edv = new DataView(tail.buffer, tail.byteOffset + eocd, 22);
    const entryCount = edv.getUint16(10, true);
    const cdSize = edv.getUint32(12, true);
    const cdOffset = edv.getUint32(16, true);
    if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported. Unzip the export and upload export.xml directly.');
    }

    // Walk central directory entries, looking for */export.xml.
    const cd = await bytesOf(file.slice(cdOffset, cdOffset + cdSize));
    const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const nameDecoder = new TextDecoder('utf-8');
    const CANONICAL = 'apple_health_export/export.xml';
    let entry = null;
    let p = 0;
    for (let n = 0; n < entryCount && p + 46 <= cd.length; n++) {
      if (cdv.getUint32(p, true) !== 0x02014b50) break;
      const flags = cdv.getUint16(p + 8, true);
      const method = cdv.getUint16(p + 10, true);
      const compSize = cdv.getUint32(p + 20, true);
      const uncompSize = cdv.getUint32(p + 24, true);
      const nameLen = cdv.getUint16(p + 28, true);
      const extraLen = cdv.getUint16(p + 30, true);
      const commentLen = cdv.getUint16(p + 32, true);
      const localOffset = cdv.getUint32(p + 42, true);
      const name = nameDecoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
      if (/(^|\/)export\.xml$/.test(name) && (!entry || name === CANONICAL)) {
        entry = { name: name, flags: flags, method: method, compSize: compSize, uncompSize: uncompSize, localOffset: localOffset };
        if (name === CANONICAL) break;
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (!entry) {
      throw new Error('Could not find export.xml inside this ZIP. Upload the Health app "export.zip" (or the export.xml inside it).');
    }
    if (entry.flags & 0x1) {
      throw new Error('This ZIP is encrypted and cannot be read. Unzip it and upload export.xml directly.');
    }
    if (entry.compSize === 0xffffffff || entry.uncompSize === 0xffffffff || entry.localOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported. Unzip the export and upload export.xml directly.');
    }

    // Local header carries its own (possibly different) name/extra lengths.
    const lh = await bytesOf(file.slice(entry.localOffset, entry.localOffset + 30));
    if (lh.length < 30) throw new Error('Corrupt ZIP: truncated local file header.');
    const ldv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
    if (ldv.getUint32(0, true) !== 0x04034b50) throw new Error('Corrupt ZIP: bad local file header signature.');
    const dataStart = entry.localOffset + 30 + ldv.getUint16(26, true) + ldv.getUint16(28, true);
    const dataBlob = file.slice(dataStart, dataStart + entry.compSize);

    if (entry.method === 0) {
      return { stream: dataBlob.stream(), totalBytes: entry.uncompSize };
    }
    if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress ZIP files. Unzip the export and upload export.xml directly.');
      }
      return {
        stream: dataBlob.stream().pipeThrough(new DecompressionStream('deflate-raw')),
        totalBytes: entry.uncompSize
      };
    }
    throw new Error('Unsupported ZIP compression method ' + entry.method + '.');
  }

  /* ---------- streaming XML parser ---------- */

  function createParser() {
    const acc = {
      workouts: [],
      bodyMass: {},   // date -> kg (last per day)
      bodyFat: {},    // date -> pct (last per day)
      daily: { steps: {}, restingHR: {}, activeEnergyKcal: {}, exerciseMin: {}, vo2max: {}, sleepHours: {} },
      hr: {},         // date -> {sum, n} for resting-HR averaging
      counts: { records: 0, skipped: 0 }
    };
    let buf = '';
    const START_RE = /<(Record|Workout)(?=\s)/g; // lookahead avoids <WorkoutEvent> etc.

    function skip() { acc.counts.skipped++; }

    function handleRecord(a) {
      acc.counts.records++;
      const date = datePart(a.startDate);
      const v = parseFloat(a.value);
      const unit = String(a.unit || '').toLowerCase();
      switch (a.type) {
        case 'HKQuantityTypeIdentifierBodyMass': {
          if (!isFinite(v) || v <= 0 || !date) return skip();
          let kg = v;
          if (unit === 'lb' || unit === 'lbs') kg = v / U.LB_PER_KG;
          else if (unit === 'g') kg = v / 1000;
          else if (unit === 'st') kg = v * 6.35029318;
          acc.bodyMass[date] = Math.round(kg * 100) / 100;
          return;
        }
        case 'HKQuantityTypeIdentifierBodyFatPercentage': {
          if (!isFinite(v) || v < 0 || !date) return skip();
          acc.bodyFat[date] = U.round1(v <= 1 ? v * 100 : v); // fraction vs percent
          return;
        }
        case 'HKQuantityTypeIdentifierStepCount': {
          if (!isFinite(v) || !date) return skip();
          acc.daily.steps[date] = (acc.daily.steps[date] || 0) + v;
          return;
        }
        case 'HKQuantityTypeIdentifierRestingHeartRate': {
          if (!isFinite(v) || !date) return skip();
          const h = acc.hr[date] || (acc.hr[date] = { sum: 0, n: 0 });
          h.sum += v;
          h.n++;
          return;
        }
        case 'HKQuantityTypeIdentifierActiveEnergyBurned': {
          if (!isFinite(v) || !date) return skip();
          acc.daily.activeEnergyKcal[date] = (acc.daily.activeEnergyKcal[date] || 0) + energyToKcal(v, unit);
          return;
        }
        case 'HKQuantityTypeIdentifierAppleExerciseTime': {
          if (!isFinite(v) || !date) return skip();
          let min = v;
          if (unit === 's' || unit === 'sec') min = v / 60;
          else if (unit === 'hr' || unit === 'h') min = v * 60;
          acc.daily.exerciseMin[date] = (acc.daily.exerciseMin[date] || 0) + min;
          return;
        }
        case 'HKQuantityTypeIdentifierVO2Max': {
          if (!isFinite(v) || !date) return skip();
          acc.daily.vo2max[date] = U.round1(v); // last per day wins (file order)
          return;
        }
        case 'HKCategoryTypeIdentifierSleepAnalysis': {
          if (String(a.value || '').indexOf('Asleep') < 0) return; // InBed/Awake: ignored
          const start = parseHKTime(a.startDate);
          const end = parseHKTime(a.endDate);
          const key = datePart(a.endDate); // bin by END date (overnight sleep)
          if (start === null || end === null || end <= start || !key) return skip();
          const hours = (end - start) / 3600000;
          if (hours > 48) return skip();
          acc.daily.sleepHours[key] = (acc.daily.sleepHours[key] || 0) + hours;
          return;
        }
        default:
          skip();
      }
    }

    function handleWorkout(a) {
      const name = friendlyActivity(a.workoutActivityType);
      const date = datePart(a.startDate);
      if (!name || !date) return;
      let dur = parseFloat(a.duration);
      if (isFinite(dur)) {
        const du = String(a.durationUnit || 'min').toLowerCase();
        if (du === 's' || du === 'sec') dur = dur / 60;
        else if (du === 'hr' || du === 'h') dur = dur * 60;
      } else {
        dur = 0;
      }
      const row = { date: date, name: name, durationMin: U.round1(dur), source: a.sourceName || '' };
      const e = parseFloat(a.totalEnergyBurned);
      if (isFinite(e)) row.kcal = Math.round(energyToKcal(e, a.totalEnergyBurnedUnit));
      acc.workouts.push(row);
    }

    // Consume every complete <Record>/<Workout> element in buf; keep the tail
    // (a partial element or partial start token) as the remainder.
    function drain(final) {
      let pos = 0;
      for (;;) {
        START_RE.lastIndex = pos;
        const m = START_RE.exec(buf);
        if (!m) {
          // No complete start token from pos on. A token may straddle the chunk
          // boundary — keep a small tail (tokens are <= 9 chars incl. whitespace).
          buf = final ? '' : buf.slice(Math.max(pos, buf.length - 16));
          return;
        }
        const start = m.index;
        const name = m[1];
        const gt = buf.indexOf('>', start);
        if (gt < 0) { buf = final ? '' : buf.slice(start); return; }
        const openTag = buf.slice(start, gt + 1);
        let end;
        if (buf.charCodeAt(gt - 1) === 47 /* '/' */) {
          end = gt + 1; // self-closing
        } else {
          const closer = '</' + name + '>';
          const ci = buf.indexOf(closer, gt + 1);
          if (ci < 0) { buf = final ? '' : buf.slice(start); return; }
          end = ci + closer.length;
        }
        const attrs = parseAttrs(openTag); // attributes live on the open tag only
        if (name === 'Record') handleRecord(attrs);
        else handleWorkout(attrs);
        pos = end;
      }
    }

    return {
      push: function (text) {
        if (!text) return;
        buf += text;
        drain(false);
      },
      finish: function () {
        drain(true);
        return finalize(acc);
      }
    };
  }

  function finalize(acc) {
    const daily = {
      steps: {}, restingHR: {}, activeEnergyKcal: {},
      exerciseMin: {}, vo2max: {}, sleepHours: {}
    };
    let d;
    for (d in acc.daily.steps) daily.steps[d] = Math.round(acc.daily.steps[d]);
    for (d in acc.hr) daily.restingHR[d] = U.round1(acc.hr[d].sum / acc.hr[d].n);
    for (d in acc.daily.activeEnergyKcal) daily.activeEnergyKcal[d] = Math.round(acc.daily.activeEnergyKcal[d]);
    for (d in acc.daily.exerciseMin) daily.exerciseMin[d] = U.round1(acc.daily.exerciseMin[d]);
    for (d in acc.daily.vo2max) daily.vo2max[d] = acc.daily.vo2max[d];
    for (d in acc.daily.sleepHours) daily.sleepHours[d] = U.round1(acc.daily.sleepHours[d]);

    function toRows(map, key) {
      return Object.keys(map).sort().map(function (dt) {
        const r = { date: dt };
        r[key] = map[dt];
        return r;
      });
    }

    return {
      workouts: acc.workouts.slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      }),
      bodyMass: toRows(acc.bodyMass, 'valueKg'),
      bodyFat: toRows(acc.bodyFat, 'pct'),
      daily: daily,
      counts: acc.counts
    };
  }

  async function parseXmlStream(stream, totalBytes, onProgress) {
    if (!stream || typeof stream.getReader !== 'function') {
      throw new Error('Could not open a readable stream for this file.');
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = createParser();
    let bytesRead = 0;
    let lastReport = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      const chunk = r.value;
      if (typeof chunk === 'string') {
        bytesRead += chunk.length;
        parser.push(chunk);
      } else {
        bytesRead += chunk.byteLength || 0;
        parser.push(decoder.decode(chunk, { stream: true }));
      }
      if (onProgress && bytesRead - lastReport >= PROGRESS_STEP) {
        lastReport = bytesRead;
        onProgress(bytesRead, totalBytes);
      }
    }
    parser.push(decoder.decode()); // flush multi-byte tail
    const parsed = parser.finish();
    if (onProgress) onProgress(bytesRead, totalBytes);
    return parsed;
  }

  /* ---------- public API ---------- */

  AppleHealth.importFile = async function (file, opts) {
    opts = opts || {};
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (!file || typeof file.slice !== 'function') throw new Error('No file provided.');

    let isZip = /\.zip$/i.test(file.name || '');
    if (!isZip && file.size >= 4) {
      const head = await bytesOf(file.slice(0, 4));
      isZip = head[0] === 0x50 && head[1] === 0x4b &&
        (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07);
    }

    let stream, totalBytes;
    if (isZip) {
      const opened = await openZipExportXml(file);
      stream = opened.stream;
      totalBytes = opened.totalBytes;
    } else {
      stream = file.stream();
      totalBytes = file.size;
    }
    return parseXmlStream(stream, totalBytes, onProgress);
  };

  const STRENGTH_RE = /strength|functional|cross\s*training|high\s*intensity/i;
  const SAMPLE_KINDS = ['steps', 'restingHR', 'activeEnergyKcal', 'exerciseMin', 'vo2max', 'sleepHours'];

  AppleHealth.applyImport = function (parsed, userId, opts) {
    opts = opts || {};
    const since = opts.since || null;
    const out = { workoutsAdded: 0, metricsAdded: 0, samplesAdded: 0 };
    const Store = window.Store;
    if (!parsed || !userId || !Store) return out;
    const keep = function (date) { return !!date && (!since || date >= since); };

    for (const r of parsed.bodyMass || []) {
      if (!keep(r.date) || !(r.valueKg > 0)) continue;
      Store.addBodyMetric({ userId: userId, date: r.date, kind: 'weightKg', value: r.valueKg, source: 'apple' });
      out.metricsAdded++;
    }
    for (const r of parsed.bodyFat || []) {
      if (!keep(r.date) || !(r.pct >= 0)) continue;
      Store.addBodyMetric({ userId: userId, date: r.date, kind: 'bodyFatPct', value: r.pct, source: 'apple' });
      out.metricsAdded++;
    }

    const daily = parsed.daily || {};
    const rows = [];
    for (const kind of SAMPLE_KINDS) {
      const map = daily[kind] || {};
      for (const date in map) {
        const value = Number(map[date]);
        if (!keep(date) || !isFinite(value)) continue;
        rows.push({ userId: userId, date: date, kind: kind, value: value, source: 'apple' });
      }
    }

    // Strength-flavored workouts become empty logged workouts — but only when the
    // user has nothing that date already (also dedupes re-imports). Everything
    // else only contributes exercise minutes, and only for dates the daily
    // AppleExerciseTime aggregate didn't already cover.
    const taken = {};
    for (const w of Store.workoutsFor(userId)) taken[w.date] = true;
    const exMinMap = daily.exerciseMin || {};
    const extraMin = {};
    for (const w of parsed.workouts || []) {
      if (!keep(w.date)) continue;
      if (STRENGTH_RE.test(w.name || '')) {
        if (taken[w.date]) continue;
        Store.addWorkout({
          userId: userId,
          date: w.date,
          name: w.name || 'Workout',
          durationMin: w.durationMin > 0 ? w.durationMin : null,
          source: 'apple',
          entries: []
        });
        taken[w.date] = true;
        out.workoutsAdded++;
      } else if (w.durationMin > 0 && exMinMap[w.date] === undefined) {
        extraMin[w.date] = (extraMin[w.date] || 0) + w.durationMin;
      }
    }
    for (const date in extraMin) {
      rows.push({ userId: userId, date: date, kind: 'exerciseMin', value: U.round1(extraMin[date]), source: 'apple' });
    }

    out.samplesAdded += Store.addHealthSamples(rows) || 0;
    return out;
  };

  /* ---------- CSV export ---------- */

  function csvField(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  AppleHealth.exportWorkoutsCSV = function (userId) {
    const Store = window.Store;
    const workouts = Store.workoutsFor(userId).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    const user = ((Store.state && Store.state.users) || []).find(function (u) { return u.id === userId; });
    const units = user && user.settings && user.settings.units === 'lb' ? 'lb' : 'kg';
    const EDB = window.ExerciseDB;
    const AN = window.Analytics;

    const lines = [[
      'date', 'workout', 'exercise', 'set_number', 'type',
      'weight(' + units + ')', 'reps', 'rpe', 'est_1rm(' + units + ')'
    ].join(',')];

    for (const w of workouts) {
      for (const entry of w.entries || []) {
        const ex = EDB && EDB.byId ? EDB.byId(entry.exerciseId) : null;
        const exName = ex && ex.name ? ex.name : (entry.exerciseId || 'Unknown');
        let n = 0;
        for (const s of entry.sets || []) {
          n++;
          const e1rmKg = AN ? AN.e1rm(s.weightKg, s.reps) : 0;
          lines.push([
            csvField(w.date),
            csvField(w.name),
            csvField(exName),
            n,
            csvField(s.type || 'work'),
            U.kgToDisplay(s.weightKg || 0, units),
            s.reps || 0,
            s.rpe === null || s.rpe === undefined ? '' : s.rpe,
            U.kgToDisplay(e1rmKg, units)
          ].join(','));
        }
      }
    }
    return lines.join('\n') + '\n';
  };

  /* ---------- settings-panel guide (static HTML, no user data) ---------- */

  AppleHealth.shortcutsGuide = [
    '<div class="ah-guide">',
    '<h3>Import from Apple Health</h3>',
    '<ol>',
    '<li>On your iPhone, open the <strong>Health</strong> app.</li>',
    '<li>Tap your <strong>profile picture</strong> in the top-right corner.</li>',
    '<li>Scroll to the bottom and tap <strong>Export All Health Data</strong>, then confirm with <strong>Export</strong>.</li>',
    '<li>Give it a minute — Health bundles everything into a single <code>export.zip</code> file.</li>',
    '<li><strong>AirDrop</strong> the file to this device, or save it to <strong>Files</strong> (or email it to yourself).</li>',
    '<li>Come back here and <strong>upload export.zip</strong> — or the <code>export.xml</code> inside it. IronLog pulls out strength workouts, body weight, body fat, steps, resting heart rate, active energy, exercise minutes, VO₂max and sleep. Large files are fine: everything is parsed on your device and never leaves it.</li>',
    '</ol>',
    '<h3>Bonus: one-tap weigh-ins with Apple Shortcuts</h3>',
    '<p>Make logging body weight effortless — it lands in Apple Health, ready for your next import:</p>',
    '<ol>',
    '<li>Open the <strong>Shortcuts</strong> app and tap <strong>+</strong> to create a new shortcut.</li>',
    '<li>Add the action <strong>Ask for Input</strong>, set the input type to <em>Number</em>, and use a prompt like &ldquo;Body weight today?&rdquo;.</li>',
    '<li>Add the action <strong>Log Health Sample</strong>, choose <em>Weight</em> as the sample type, and pass the <em>Provided Input</em> as the value.</li>',
    '<li>Name it <strong>Log Weight</strong>, then add it to your Home Screen — or just say &ldquo;Hey Siri, Log Weight&rdquo;.</li>',
    '</ol>',
    '<p>Next time you export from Health and import here, those weigh-ins flow straight into your body-weight chart.</p>',
    '</div>'
  ].join('\n');

  window.AppleHealth = AppleHealth;
})();
