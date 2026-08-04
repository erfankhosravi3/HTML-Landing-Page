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

  function distanceToKm(v, unit) {
    const u = String(unit || '').toLowerCase();
    if (u === 'mi') return v * 1.609344;
    if (u === 'm') return v / 1000;
    if (u === 'yd') return v * 0.0009144;
    if (u === 'ft') return v * 0.0003048;
    return v; // 'km' / unknown -> already km
  }

  /* ---------- P4: HK workout -> typed cardio mapping ----------
     Only these activity types become cardio entries (the contract's list).
     Walking maps to its own 'walk' mode: an Apple Watch records ordinary daily
     walks prolifically, and walking kilometres are not running kilometres —
     'walk' belongs to no LoadModel modality, so imported walks are logged and
     visible but never move run load, run ACWR or the run-ramp advisory.
     Hiking defaults to 'run' (foot mileage) and only becomes a ruck behind the
     one per-import-session confirmation — a ruck without a load is a lie about
     the session, so it is never assumed. */
  const WORKOUT_MODES = {
    Running: 'run',
    Walking: 'walk',
    Hiking: 'run',
    Swimming: 'swim',
    Cycling: 'bike',
    Rowing: 'row',
    StairClimbing: 'stairs'
  };

  const STAT_RE = /<WorkoutStatistics\b[^>]*>/g;
  const META_RE = /<MetadataEntry\b[^>]*>/g;

  // Newer exports (iOS 16+) moved distance/HR out of the Workout attributes and
  // into <WorkoutStatistics> children, so both shapes are read.
  function readWorkoutStats(inner) {
    const out = { distanceKm: 0, avgHR: 0, maxHR: 0 };
    if (!inner || inner.indexOf('<WorkoutStatistics') < 0) return out;
    STAT_RE.lastIndex = 0;
    let m;
    while ((m = STAT_RE.exec(inner))) {
      const s = parseAttrs(m[0]);
      const t = String(s.type || '');
      if (t.indexOf('HKQuantityTypeIdentifierDistance') === 0) {
        const v = parseFloat(s.sum);
        if (isFinite(v) && v > 0) out.distanceKm = Math.max(out.distanceKm, distanceToKm(v, s.unit));
      } else if (t === 'HKQuantityTypeIdentifierHeartRate') {
        const av = parseFloat(s.average);
        if (isFinite(av) && av > 0) out.avgHR = av;
        const mx = parseFloat(s.maximum);
        if (isFinite(mx) && mx > 0) out.maxHR = mx;
      }
    }
    return out;
  }

  function hex8(n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); }

  // Deterministic 64-bit-ish hash (two independent 32-bit mixes) — the fallback
  // identity for exports that carry no UUID. Same export -> same appleId, which
  // is what makes re-import dedupe work.
  function hashHex(s) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 + c, 0x85ebca6b);
    }
    return hex8(h1) + hex8(h2);
  }

  function workoutAppleId(a, inner, key) {
    if (a.uuid) return String(a.uuid);
    if (a.UUID) return String(a.UUID);
    if (inner && inner.indexOf('<MetadataEntry') >= 0) {
      META_RE.lastIndex = 0;
      let m;
      while ((m = META_RE.exec(inner))) {
        const md = parseAttrs(m[0]);
        if (md.key === 'HKExternalUUID' && md.value) return String(md.value);
      }
    }
    return 'ah_' + hashHex(String(a.startDate || '') + '|' + key);
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
      hkWorkouts: [], // P4: mapped cardio candidates (subset of workouts, richer)
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

    function handleWorkout(a, inner) {
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
      collectCardio(a, inner, name, date, row);
    }

    // P4: the same element, kept a second time in the richer shape the typed
    // cardio import needs. parsed.workouts stays exactly what it always was.
    function collectCardio(a, inner, name, date, row) {
      const key = String(a.workoutActivityType || '').replace(/^HKWorkoutActivityType/, '');
      const mode = WORKOUT_MODES[key];
      if (!mode) return;
      const stats = readWorkoutStats(inner);
      let km = 0;
      const td = parseFloat(a.totalDistance);
      if (isFinite(td) && td > 0) km = distanceToKm(td, a.totalDistanceUnit);
      if (stats.distanceKm > km) km = stats.distanceKm;
      const out = {
        appleId: workoutAppleId(a, inner, key),
        activityType: key,
        mode: mode,
        date: date,
        name: name,
        durationMin: row.durationMin,
        source: row.source
      };
      if (km > 0) out.distanceKm = Math.round(km * 1000) / 1000;
      if (stats.avgHR > 0) out.avgHR = Math.round(stats.avgHR);
      if (stats.maxHR > 0) out.maxHR = Math.round(stats.maxHR);
      if (row.kcal !== undefined) out.kcal = row.kcal;
      const st = parseHKTime(a.startDate);
      if (st !== null) out.startedAt = st;
      const en = parseHKTime(a.endDate);
      if (en !== null) out.endedAt = en;
      acc.hkWorkouts.push(out);
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
        let inner = ''; // child elements — Workout carries stats/metadata there
        if (buf.charCodeAt(gt - 1) === 47 /* '/' */) {
          end = gt + 1; // self-closing
        } else {
          const closer = '</' + name + '>';
          const ci = buf.indexOf(closer, gt + 1);
          if (ci < 0) { buf = final ? '' : buf.slice(start); return; }
          if (name === 'Workout') inner = buf.slice(gt + 1, ci);
          end = ci + closer.length;
        }
        const attrs = parseAttrs(openTag); // attributes live on the open tag only
        if (name === 'Record') handleRecord(attrs);
        else handleWorkout(attrs, inner);
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
      hkWorkouts: acc.hkWorkouts.slice().sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.startedAt || 0) - (b.startedAt || 0);
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

  /* ---------- P4: typed cardio workout import ----------
     applyImport above keeps its P1 job (body metrics, daily samples, strength
     sessions). The cardio import is a separate pass so the legacy behavior is
     untouched and so the UI can preview the plan before writing anything. */

  const DUP_REASON = 'duplicate';
  const DUP_DETAIL = 'Already imported';
  const DELETED_DETAIL = 'Deleted earlier — not re-imported';
  const OVERLAP_REASON = 'overlap';
  const OVERLAP_TOLERANCE = 0.25; // |duration delta| <= 25% counts as the same session

  function entryKindOf(e) {
    if (!e || typeof e !== 'object') return 'lift';
    const t = e.type;
    if (t === undefined || t === null || t === 'lift') return 'lift';
    if (t === 'cardio') return typeof e.mode === 'string' && e.mode ? e.mode : 'cardio';
    return typeof t === 'string' ? t : 'lift';
  }

  // Mirrors Store.deriveKind for workouts written before kind existed.
  function workoutKindOf(w) {
    if (w && typeof w.kind === 'string' && w.kind) return w.kind;
    const entries = w && Array.isArray(w.entries) ? w.entries : [];
    const kinds = [];
    for (const e of entries) {
      const k = entryKindOf(e);
      if (kinds.indexOf(k) < 0) kinds.push(k);
    }
    if (!kinds.length) return null;
    return kinds.length === 1 ? kinds[0] : 'mixed';
  }

  function workoutDuration(w) {
    if (w && typeof w.durationMin === 'number' && isFinite(w.durationMin)) return w.durationMin;
    let sum = 0;
    for (const e of (w && Array.isArray(w.entries) ? w.entries : [])) {
      const d = Number(e && e.durationMin);
      if (isFinite(d)) sum += d;
    }
    return sum;
  }

  // (b) of the double-count rule: a MANUAL session of the same user, same date,
  // same kind, whose duration is within 25% of the Apple one.
  function findClash(existing, row, mode) {
    for (const w of existing) {
      if (!w || w.date !== row.date) continue;
      if ((w.source || 'manual') === 'apple') continue;
      if (workoutKindOf(w) !== mode) continue;
      const ed = workoutDuration(w);
      const cd = Number(row.durationMin) || 0;
      const base = cd > 0 ? cd : ed;
      if (base <= 0 || Math.abs(ed - cd) <= base * OVERLAP_TOLERANCE) return w;
    }
    return null;
  }

  AppleHealth.planWorkoutImport = function (parsed, userId, opts) {
    opts = opts || {};
    const since = opts.since || null;
    const hikeRuck = opts.hikingAsRuck === true;
    const rows = (parsed && Array.isArray(parsed.hkWorkouts)) ? parsed.hkWorkouts : [];
    const Store = window.Store;
    const source = Array.isArray(opts.existing)
      ? opts.existing
      : (Store && Store.workoutsFor ? Store.workoutsFor(userId) || [] : []);
    const existing = source.filter(function (w) {
      return w && (!userId || !w.userId || w.userId === userId);
    });

    const seen = {};
    for (const w of existing) {
      if (w && w.appleId) seen[String(w.appleId)] = true;
    }
    // Deleting an imported session is a decision, not a hiccup: its appleId is
    // tombstoned by the Store, so re-importing the same export never brings it
    // back. Callers planning against a hypothetical store can pass their own map.
    const tombstoned = (opts.deletedAppleIds && typeof opts.deletedAppleIds === 'object')
      ? opts.deletedAppleIds
      : ((Store && typeof Store.deletedAppleIds === 'function') ? Store.deletedAppleIds(userId) || {} : {});

    const items = [];
    const skipped = [];
    let hikes = 0;
    let considered = 0;
    for (const r of rows) {
      if (!r || !r.date) continue;
      if (since && r.date < since) continue;
      considered++;
      const isHike = r.activityType === 'Hiking';
      if (isHike) hikes++;
      const mode = isHike && hikeRuck ? 'ruck' : r.mode;
      const id = String(r.appleId || '');
      if (id && seen[id]) {
        skipped.push({ date: r.date, name: r.name, durationMin: r.durationMin,
          reason: DUP_REASON, detail: DUP_DETAIL });
        continue;
      }
      if (id && tombstoned[id]) {
        skipped.push({ date: r.date, name: r.name, durationMin: r.durationMin,
          reason: DUP_REASON, detail: DELETED_DETAIL });
        continue;
      }
      const clash = findClash(existing, r, mode);
      if (clash) {
        skipped.push({ date: r.date, name: r.name, durationMin: r.durationMin,
          reason: OVERLAP_REASON, detail: 'Already logged as “' + (clash.name || 'a session') + '”' });
        continue;
      }
      if (id) seen[id] = true;
      items.push({ row: r, mode: mode, appleId: id });
    }
    return { items: items, skipped: skipped, hikes: hikes, considered: considered };
  };

  AppleHealth.applyWorkoutImport = function (parsed, userId, opts) {
    opts = opts || {};
    const plan = AppleHealth.planWorkoutImport(parsed, userId, opts);
    const out = {
      workoutsAdded: 0,
      skipped: plan.skipped,
      hikes: plan.hikes,
      considered: plan.considered,
      hikingAsRuck: opts.hikingAsRuck === true
    };
    const Store = window.Store;
    if (!userId || !Store || !Store.addWorkout) return out;

    // Build every session first, then hand the whole list to the Store: one
    // persist for the import instead of two per session (a multi-year export is
    // 1000+ sessions, and every persist re-serializes the entire state).
    // appleId rides on the workout, not the entry, and addWorkout carries it in
    // its fixed shape — no second write to patch it on.
    const built = [];
    for (const it of plan.items) {
      const r = it.row;
      const dur = r.durationMin > 0 ? r.durationMin : 0;
      // Plain P1 cardio: no new entry types, nothing an old client can't read.
      const entry = { id: U.uid('en'), type: 'cardio', mode: it.mode, durationMin: dur };
      if (r.distanceKm > 0) entry.distanceKm = r.distanceKm;
      if (r.avgHR > 0) entry.avgHR = r.avgHR;
      if (r.maxHR > 0) entry.maxHR = r.maxHR;
      const w = {
        userId: userId,
        date: r.date,
        name: r.name || 'Workout',
        durationMin: dur > 0 ? Math.max(1, Math.round(dur)) : null,
        startedAt: typeof r.startedAt === 'number' ? r.startedAt : null,
        endedAt: typeof r.endedAt === 'number' ? r.endedAt : null,
        source: 'apple',
        entries: [entry]
      };
      if (it.appleId) w.appleId = it.appleId;
      built.push(w);
    }
    if (!built.length) return out;
    if (typeof Store.addWorkouts === 'function') {
      out.workoutsAdded = (Store.addWorkouts(built) || []).length;
      return out;
    }
    // Older Store without the batch entry point: write one at a time, and only
    // patch the appleId on when that Store's fixed shape dropped it.
    for (const w of built) {
      const saved = Store.addWorkout(w);
      if (saved && saved.id && w.appleId && !saved.appleId && Store.updateWorkout) {
        Store.updateWorkout(saved.id, { appleId: w.appleId });
      }
      out.workoutsAdded++;
    }
    return out;
  };

  AppleHealth.WORKOUT_MODES = WORKOUT_MODES;

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

  /* ======================================================================
     THE HEALTH LINK — deliveries that arrive on their own
     ======================================================================
     A courier that holds HealthKit permission (Health Auto Export) POSTs a
     JSON body to a private inbox on a schedule. This is the parsing half;
     sync.js owns the fetch, because it is the only module allowed on the
     network.

     WRITTEN DEFENSIVELY, ON PURPOSE. The courier's exact payload shape cannot
     be verified from here — the same class of gap that let a malformed API
     schema ship. So: accept several plausible shapes, never throw, and keep
     the raw body of the last delivery so a mis-map is DIAGNOSABLE on screen
     instead of silently producing nothing.                                */

  // Courier metric name (lowercased, punctuation stripped) -> our kind.
  /* Keys here MUST be normKey() output — lowercase, alphanumeric only. An
     earlier version listed underscored aliases like `resting_heart_rate`,
     which normKey can never produce, so half this table was dead weight while
     our OWN kind names were missing entirely: a flat map keyed `restingHR`
     matched nothing. Aliases belong on the left of normKey, not in the key. */
  const INBOX_KINDS = {
    // Health Auto Export / HealthKit names
    restingheartrate: 'restingHR',
    heartrateresting: 'restingHR',
    stepcount: 'steps',
    steps: 'steps',
    activeenergy: 'activeEnergyKcal',
    activeenergyburned: 'activeEnergyKcal',
    appleexercisetime: 'exerciseMin',
    exercisetime: 'exerciseMin',
    exerciseminutes: 'exerciseMin',
    vo2max: 'vo2max',
    sleepanalysis: 'sleepHours',
    timeasleep: 'sleepHours',
    asleep: 'sleepHours',
    weightbodymass: 'weightKg',
    bodymass: 'weightKg',
    weight: 'weightKg',
    bodyfatpercentage: 'bodyFatPct',
    bodyfat: 'bodyFatPct',
    // our own kind names, so a hand-built shortcut can post them directly
    restinghr: 'restingHR',
    activeenergykcal: 'activeEnergyKcal',
    exercisemin: 'exerciseMin',
    sleephours: 'sleepHours',
    weightkg: 'weightKg',
    bodyfatpct: 'bodyFatPct'
  };


  function normKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // "2026-08-01 05:00:00 -0700" | ISO | epoch ms -> YYYY-MM-DD, or ''.
  function inboxDate(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(v > 1e12 ? v : v * 1000);
      return isNaN(d.getTime()) ? '' : U.dateToStr(d);
    }
    const str = String(v).trim();
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(str);
    if (m) return m[1];                       // already date-first; no timezone shift
    const d = new Date(str);
    return isNaN(d.getTime()) ? '' : U.dateToStr(d);
  }

  function toKg(value, units) {
    const u = String(units || '').toLowerCase();
    if (u.indexOf('lb') >= 0 || u.indexOf('pound') >= 0) return Number(value) / U.LB_PER_KG;
    return Number(value);
  }

  // Sleep arrives as hours, minutes or seconds depending on the courier.
  function toHours(value, units) {
    const n = Number(value);
    const u = String(units || '').toLowerCase();
    if (u.indexOf('min') >= 0) return n / 60;
    if (u.indexOf('sec') >= 0) return n / 3600;
    if (u.indexOf('hr') >= 0 || u.indexOf('hour') >= 0) return n;
    // No unit: assume hours if it is a plausible night, minutes otherwise.
    return n > 24 ? n / 60 : n;
  }

  /* Returns { rows, kinds, unknown, dates } and NEVER throws.
     `unknown` is the list of metric names we received but do not map — the
     single most useful thing to show when a delivery lands and nothing
     appears. */
  AppleHealth.parseDelivery = function (payload, userId) {
    const out = { rows: [], kinds: {}, unknown: [], dates: {} };
    if (!payload) return out;

    let root = payload;
    if (typeof root === 'string') {
      try { root = JSON.parse(root); } catch (e) { return out; }
    }
    if (!root || typeof root !== 'object') return out;

    // Health Auto Export nests under data.metrics; some setups post the inner
    // object directly, and a hand-built shortcut may post a flat map.
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    let metrics = data.metrics;
    if (!Array.isArray(metrics)) {
      if (Array.isArray(data)) metrics = data;
      else if (data && typeof data === 'object') {
        // Flat: { restingHR: {"2026-08-01": 58}, ... }
        metrics = Object.keys(data).map(function (k) {
          const v = data[k];
          if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
          return { name: k, data: Object.keys(v).map(function (d) {
            return { date: d, qty: v[d] };
          }) };
        }).filter(Boolean);
      }
    }
    if (!Array.isArray(metrics)) return out;

    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      if (!m || typeof m !== 'object') continue;
      const kind = INBOX_KINDS[normKey(m.name)];
      if (!kind) {
        if (m.name && out.unknown.indexOf(String(m.name)) < 0) out.unknown.push(String(m.name));
        continue;
      }
      const points = Array.isArray(m.data) ? m.data : [];
      for (let j = 0; j < points.length; j++) {
        const pt = points[j];
        if (!pt || typeof pt !== 'object') continue;
        const date = inboxDate(pt.date || pt.startDate || pt.day);
        if (!date) continue;
        let raw = pt.qty;
        if (raw === undefined) raw = pt.value;
        if (raw === undefined) raw = pt.Avg;
        if (raw === undefined) raw = pt.total;
        if (raw === undefined || raw === null || raw === '') continue;
        let value = Number(raw);
        if (!isFinite(value)) continue;
        if (kind === 'weightKg') value = toKg(value, m.units);
        if (kind === 'sleepHours') value = toHours(value, m.units);
        out.rows.push({ userId: userId, date: date, kind: kind,
          value: Math.round(value * 100) / 100, source: 'link' });
        out.kinds[kind] = (out.kinds[kind] || 0) + 1;
        out.dates[date] = true;
      }
    }
    return out;
  };

  AppleHealth.INBOX_KINDS = INBOX_KINDS;

  AppleHealth.shortcutsGuide = [
    '<div class="ah-guide">',
    '<h3>Import from Apple Health</h3>',
    '<ol>',
    '<li>On your iPhone, open the <strong>Health</strong> app.</li>',
    '<li>Tap your <strong>profile picture</strong> in the top-right corner.</li>',
    '<li>Scroll to the bottom and tap <strong>Export All Health Data</strong>, then confirm with <strong>Export</strong>.</li>',
    '<li>Give it a minute — Health bundles everything into a single <code>export.zip</code> file.</li>',
    '<li><strong>AirDrop</strong> the file to this device, or save it to <strong>Files</strong> (or email it to yourself).</li>',
    '<li>Come back here and <strong>upload export.zip</strong> — or the <code>export.xml</code> inside it. IronLog pulls out strength workouts, runs, walks, hikes, rides, swims and rows, body weight, body fat, steps, resting heart rate, active energy, exercise minutes, VO₂max and sleep. Large files are fine: everything is parsed on your device and never leaves it.</li>',
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
