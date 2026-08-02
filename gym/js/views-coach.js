/* IronLog — Coach view: the conversation, and the editable proposal card.
   See ARCHITECTURE.md "V2 ADDENDUM — P6: AI COACH".

   This file renders and it commits what the USER accepts. It never commits
   what the model returned: coach.js hands back a validated proposal object,
   the user edits and ticks it, and only then does anything reach the Store.
   The guardrails run over the result twice — once before it is shown, once at
   accept time — and there is no path around them. */
(function () {
  'use strict';

  const U = window.U;
  const icons = App.icons;

  /* ---------- helpers ---------- */

  function curUser() { return Store.currentUser(); }
  function C() { return window.Coach; }
  function today() { return U.todayStr(); }
  function myWorkouts() {
    const u = curUser();
    return u ? Store.workoutsFor(u.id) : [];
  }

  /* Same attribute set app.js's svg() helper emits — including the explicit
     width/height, without which the icon collapses to nothing anywhere the
     stylesheet does not happen to size it. */
  const COACH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3a5 5 0 0 1 5 5c0 1.8-.9 3-1.8 4-.7.8-1.2 1.5-1.2 2.5v.5h-4v-.5c0-1-.5-1.7-1.2-2.5C7.9 11 7 9.8 7 8a5 5 0 0 1 5-5Z"/>' +
    '<path d="M10 19h4"/><path d="M10.5 21.5h3"/></svg>';

  /* ======================================================================
     Guardrails over a proposal — run twice, never skippable
     ======================================================================
     The proposal is turned into a draft-shaped workout and handed to the SAME
     Guardrails.checkSession the manual builder uses. Nothing the model said
     participates in this decision. */

  /* Builds the session the app WOULD create, then judges that.

     It goes through Player.draftFromRoutine rather than hand-rolling entries,
     because the entry SHAPE decides which rules fire: a squat becomes a lift
     entry and a dead hang becomes setwork, and a hand-rolled "everything is
     setwork" conversion would quietly hide every lift rule from the check.

     Then the targets are materialised onto the real set keys. The draft keeps
     prescriptions on _t* placeholders (the P4.5 phantom-write fix, and it is
     right), but "would this session be safe IF he did it as written" is
     exactly the question here, so the check needs the prescribed numbers on
     the keys the rules read. The materialised copy is thrown away; the draft
     the user actually gets is untouched. */
  function proposedDraft(proposal, accepted) {
    const u = curUser();
    const P = window.Player;
    if (!u || !P || typeof P.draftFromRoutine !== 'function') return null;
    const routine = C().toRoutine(proposal, accepted);
    if (!routine) return null;
    let d = null;
    try { d = P.draftFromRoutine(routine, { userId: u.id, name: routine.name }); }
    catch (e) { return null; }
    if (!d || !Array.isArray(d.entries)) return null;

    const TARGETS = { _tReps: 'reps', _tHoldSec: 'holdSec',
      _tDistanceM: 'distanceM', _tWeightKg: 'weightKg' };
    const entries = d.entries.map(function (en) {
      const copy = {};
      for (const k in en) copy[k] = en[k];
      if (Array.isArray(en.sets)) {
        copy.sets = en.sets.map(function (s) {
          const c = {};
          for (const k in s) {
            if (k in TARGETS) c[TARGETS[k]] = s[k];
            else if (k.charAt(0) !== '_') c[k] = s[k];
          }
          return c;
        });
      }
      return copy;
    });
    return { userId: u.id, date: today(), kind: routine.kind, entries: entries };
  }

  function checkProposal(proposal, accepted) {
    const u = curUser();
    const G = window.Guardrails;
    if (!u || !G || !proposal) return [];
    const draft = proposedDraft(proposal, accepted);
    if (!draft) return [];

    let flags = [];
    try { flags = G.checkSession(draft, myWorkouts(), u, Store.painFor(u.id)) || []; }
    catch (e) { flags = []; }

    /* Live pain flags for the regions this session would load.
       checkSession's only stop-level rule is ruck-specific, so without this a
       proposal the coach can actually make could never be blocked at all — the
       promise in the contract would be technically true and practically empty.
       A red pain flag on a muscle the session targets is a stop. */
    let pf = [];
    try { pf = G.painFlags(Store.painFor(u.id)) || []; } catch (e) { pf = []; }
    const targeted = musclesOf(draft);
    for (let i = 0; i < pf.length; i++) {
      const f = pf[i];
      if (f.level !== 'red') continue;
      if (!touches(f, targeted)) continue;
      flags.push({ level: 'stop', code: f.code, message: f.message });
    }
    return flags;
  }

  function musclesOf(draft) {
    const DB = window.ExerciseDB;
    const out = {};
    if (!DB || typeof DB.byId !== 'function') return out;
    (draft.entries || []).forEach(function (en) {
      const ref = en.exerciseRef || en.exerciseId;
      const ex = ref ? DB.byId(ref) : null;
      if (!ex) return;
      (ex.primaryMuscles || []).concat(ex.secondaryMuscles || []).forEach(function (m) {
        out[m] = true;
      });
    });
    return out;
  }

  // painFlags rows carry the region(s) they concern; match on whichever the
  // build exposes rather than assuming one field name.
  function touches(flag, targeted) {
    const ids = [].concat(flag.muscleId || [], flag.muscleIds || [], flag.regions || []);
    if (!ids.length) return false;
    for (let i = 0; i < ids.length; i++) {
      if (targeted[ids[i]]) return true;
    }
    return false;
  }

  function stopFlags(flags) {
    return (flags || []).filter(function (f) { return f.level === 'stop'; });
  }

  /* ======================================================================
     Proposal card — an editable draft, never a yes/no
     ====================================================================== */

  // Live edit state, keyed by chat message id, so a rerender does not discard
  // what the user has ticked or typed.
  const editState = {};

  function stateFor(msgId, proposal) {
    if (!editState[msgId]) {
      editState[msgId] = {
        accepted: proposal.items.map(function (it) { return !!it.resolved; }),
        items: proposal.items.map(function (it) { return shallow(it); })
      };
    }
    return editState[msgId];
  }
  function shallow(o) {
    const c = {};
    for (const k in o) c[k] = o[k];
    return c;
  }

  function numField(label, key, val, unit) {
    return '<label class="cp-num"><span>' + U.esc(label) + '</span>' +
      '<input type="number" inputmode="numeric" data-k="' + key + '" ' +
      'value="' + (val === undefined || val === null ? '' : U.esc(String(val))) + '">' +
      (unit ? '<em>' + U.esc(unit) + '</em>' : '') + '</label>';
  }

  function proposalHtml(msgId, proposal) {
    const st = stateFor(msgId, proposal);
    const units = App.units();
    const flags = checkProposal({ items: st.items, name: proposal.name, kind: proposal.kind,
      restSec: proposal.restSec }, st.accepted);
    const stops = stopFlags(flags);

    let h = '<div class="coach-prop' + (stops.length ? ' blocked' : '') + '" data-prop="' + U.esc(msgId) + '">';
    h += '<div class="cp-head"><span class="cp-kind">' + U.esc(proposal.kind) + '</span>' +
      '<strong>' + U.esc(proposal.name) + '</strong></div>';
    if (proposal.rationale) {
      h += '<p class="cp-why">' + U.esc(proposal.rationale) + '</p>';
    }

    h += '<div class="cp-items">';
    for (let i = 0; i < st.items.length; i++) {
      const it = st.items[i];
      const on = st.accepted[i];
      h += '<div class="cp-item' + (on ? ' on' : '') + (it.resolved ? '' : ' unresolved') + '" data-i="' + i + '">';
      h += '<button type="button" class="cp-tick" data-act="toggle" data-i="' + i + '" ' +
        (it.resolved ? '' : 'disabled ') +
        'aria-pressed="' + (on ? 'true' : 'false') + '">' + (on ? icons.check : '') + '</button>';
      h += '<div class="cp-body">';
      h += '<div class="cp-name">' + U.esc(it.name) +
        (it.resolved ? '' : '<span class="cp-warn">not in your library</span>') + '</div>';
      if (it.resolved) {
        h += '<div class="cp-nums">';
        h += numField('Sets', 'sets', it.sets, '');
        if (it.targetReps !== undefined) h += numField('Reps', 'targetReps', it.targetReps, '');
        if (it.targetHoldSec !== undefined) h += numField('Hold', 'targetHoldSec', it.targetHoldSec, 's');
        if (it.targetDistanceM !== undefined) h += numField('Distance', 'targetDistanceM', it.targetDistanceM, 'm');
        if (it.targetWeightKg !== undefined) {
          h += numField('Weight', '_w', U.kgToDisplay(it.targetWeightKg, units), units);
        }
        h += '</div>';
      }
      if (it.note) h += '<div class="cp-note">' + U.esc(it.note) + '</div>';
      h += '</div></div>';
    }
    h += '</div>';

    /* Guardrail verdict. A stop flag blocks acceptance outright — there is no
       override control anywhere in this markup, by design. */
    if (flags.length) {
      h += '<div class="cp-flags">';
      for (let i = 0; i < flags.length; i++) {
        h += '<div class="cp-flag ' + U.esc(flags[i].level || 'warn') + '">' +
          icons.alert + '<span>' + U.esc(flags[i].message || '') + '</span></div>';
      }
      h += '</div>';
    }

    const nOn = st.accepted.filter(Boolean).length;
    h += '<div class="cp-actions">';
    if (stops.length) {
      h += '<p class="cp-blocked">Blocked by your own injury rules. Edit the numbers ' +
        'above until the warning clears — the coach cannot override this and neither can I.</p>';
    }
    h += '<button type="button" class="btn primary" data-act="start"' +
      (stops.length || !nOn ? ' disabled' : '') + '>Start ' + nOn + ' of ' +
      st.items.length + '</button>';
    h += '<button type="button" class="btn ghost small" data-act="save"' +
      (stops.length || !nOn ? ' disabled' : '') + '>Save as routine</button>';
    h += '<button type="button" class="btn ghost small" data-act="reject">Dismiss</button>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  /* ======================================================================
     Rendering the thread
     ====================================================================== */

  let pending = false;
  /* What the coach has said SO FAR, plus when the request started. A long
     silence reads as broken, so the wait shows real progress: the reply as it
     streams, and the seconds elapsed when there is nothing to show yet. */
  let streamText = '';
  let streamStartedAt = 0;
  let streamTick = null;

  function messageHtml(m) {
    if (m.role === 'user') {
      return '<div class="coach-msg me"><div class="cm-bubble">' + U.esc(m.text) + '</div></div>';
    }
    let h = '<div class="coach-msg coach"><div class="cm-bubble">';
    if (m.error) {
      h += '<span class="cm-err">' + icons.alert + ' ' + U.esc(m.error) + '</span>';
    } else {
      h += U.esc(m.text || '').replace(/\n/g, '<br>');
    }
    h += '</div>';
    if (m.proposal) h += proposalHtml(m.id, m.proposal);
    if (m.question) {
      h += '<div class="coach-q" data-q="' + U.esc(m.id) + '">' +
        '<div class="cq-text">' + U.esc(m.question) + '</div>' +
        '<div class="cq-row">' +
        '<input type="text" class="cq-input" placeholder="Answer — it is saved to your journal">' +
        '<button type="button" class="btn small" data-act="answer">Save</button>' +
        '</div></div>';
    }
    if (m.usage) {
      const c = C().cost(m.usage);
      h += '<div class="cm-meta">' + C().fmtUsd(c.usd) +
        (c.cacheRead ? ' · ' + Math.round(c.cacheRead / 1000) + 'k cached' : '') +
        (c.saved > 0.005 ? ' · saved ' + C().fmtUsd(c.saved) : '') + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderCoach(container) {
    const u = curUser();
    if (!u || !App.isPerformance() || !C() || !C().hasKey()) {
      App.navigate('dashboard');
      return;
    }

    const thread = Store.chatFor(u.id);
    let html = '<div class="coach-view">' +
      '<div class="view-head coach-head"><h2>Coach</h2>' +
      '<div class="sub">Sees your whole log. Proposes; you decide.</div>' +
      /* Clearing lives up here, not in the composer bar: it is destructive and
         has no business sitting beside Send, and pinning it made the bar tall
         enough to graze the tabbar. */
      (thread.length ? '<button type="button" class="btn ghost small" id="coach-clear">Clear</button>' : '') +
      '</div>';

    html += '<div class="coach-thread" id="coach-thread">';
    if (!thread.length) {
      html += '<div class="coach-empty">' + COACH_ICON +
        '<p>Ask anything about your training. It has read every session, ' +
        'every pain entry and every journal note you have written.</p>' +
        '<div class="coach-seeds">' +
        '<button type="button" class="btn ghost small" data-seed="What should I train today, and why?">What should I train today?</button>' +
        '<button type="button" class="btn ghost small" data-seed="Look at my last four weeks. What is my weakest link for selection?">Where am I weakest?</button>' +
        '<button type="button" class="btn ghost small" data-seed="Am I ramping too fast? Be honest.">Am I ramping too fast?</button>' +
        '</div></div>';
    }
    for (let i = 0; i < thread.length; i++) html += messageHtml(thread[i]);
    if (pending) {
      const secs = streamStartedAt ? Math.round((Date.now() - streamStartedAt) / 1000) : 0;
      html += '<div class="coach-msg coach" id="coach-live">';
      if (streamText) {
        html += '<div class="cm-bubble">' + U.esc(streamText).replace(/\n/g, '<br>') +
          '<span class="cm-caret"></span></div>';
      } else {
        html += '<div class="cm-bubble thinking">' +
          '<span></span><span></span><span></span>' +
          (secs >= 3 ? '<em class="cm-elapsed">reading your log · ' + secs + 's</em>' : '') +
          '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    /* running cost for this conversation — it is his money */
    let total = 0;
    let saved = 0;
    for (let i = 0; i < thread.length; i++) {
      if (!thread[i].usage) continue;
      const c = C().cost(thread[i].usage);
      total += c.usd;
      saved += c.saved;
    }
    html += '<div class="coach-bar">' +
      '<div class="coach-cost">' + (total > 0
        ? 'This conversation: ' + C().fmtUsd(total) +
          (saved > 0.005 ? ' · caching saved ' + C().fmtUsd(saved) : '') +
          ' <span class="muted">(estimate, ' + C().RATES.asOf + ' rates)</span>'
        : '') + '</div>' +
      '<form class="coach-compose" id="coach-form">' +
      '<textarea id="coach-input" rows="1" placeholder="Ask your coach…"' +
      (pending ? ' disabled' : '') + '></textarea>' +
      '<button type="submit" class="btn primary" id="coach-send"' + (pending ? ' disabled' : '') + '>Send</button>' +
      '</form>' +
      '</div></div>';

    container.innerHTML = html;
    wire(container);
    const t = U.$('#coach-thread', container);
    if (t) t.scrollTop = t.scrollHeight;
  }

  /* ======================================================================
     Wiring
     ====================================================================== */

  function wire(root) {
    const form = U.$('#coach-form', root);
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const box = U.$('#coach-input', root);
        const text = (box && box.value || '').trim();
        if (!text) return;
        box.value = '';
        ask(text);
      });
    }
    U.on(root, 'click', '[data-seed]', function (e, b) {
      ask(b.getAttribute('data-seed'));
    });
    const clear = U.$('#coach-clear', root);
    if (clear) {
      clear.addEventListener('click', function () {
        App.confirm({
          title: 'Clear this conversation?',
          message: 'The chat goes. Your workouts, journal and check-in answers all stay.',
          danger: true, confirmLabel: 'Clear'
        }).then(function (ok) {
          if (!ok) return;
          const u = curUser();
          if (u) Store.clearChat(u.id);
          App.rerender();
        });
      });
    }

    /* ---- proposal editing ---- */
    U.on(root, 'click', '.coach-prop [data-act="toggle"]', function (e, b) {
      const wrap = b.closest('.coach-prop');
      const st = editState[wrap.getAttribute('data-prop')];
      const i = Number(b.getAttribute('data-i'));
      if (!st || !st.items[i] || !st.items[i].resolved) return;
      st.accepted[i] = !st.accepted[i];
      App.rerender();
    });

    U.on(root, 'change', '.coach-prop input[data-k]', function (e, input) {
      const wrap = input.closest('.coach-prop');
      const st = editState[wrap.getAttribute('data-prop')];
      const i = Number(input.closest('.cp-item').getAttribute('data-i'));
      if (!st || !st.items[i]) return;
      const k = input.getAttribute('data-k');
      const raw = input.value;
      if (raw === '') {
        // Clearing a field removes the target rather than writing 0 — a
        // zero-rep set is a different (and wrong) instruction.
        if (k === '_w') delete st.items[i].targetWeightKg;
        else if (k !== 'sets') delete st.items[i][k];
        App.rerender();
        return;
      }
      const v = Number(raw);
      if (!isFinite(v)) return;
      if (k === '_w') st.items[i].targetWeightKg = U.displayToKg(v, App.units());
      else if (k === 'sets') st.items[i].sets = Math.max(1, Math.min(20, Math.round(v)));
      else st.items[i][k] = Math.max(0, v);
      App.rerender();
    });

    U.on(root, 'click', '.coach-prop [data-act="start"]', function (e, b) {
      commit(b.closest('.coach-prop'), 'start');
    });
    U.on(root, 'click', '.coach-prop [data-act="save"]', function (e, b) {
      commit(b.closest('.coach-prop'), 'save');
    });
    U.on(root, 'click', '.coach-prop [data-act="reject"]', function (e, b) {
      const id = b.closest('.coach-prop').getAttribute('data-prop');
      delete editState[id];
      Store.updateChatMessage(id, { proposal: null });
      App.toast('Proposal dismissed', 'ok');
      App.rerender();
    });

    /* ---- answering a coach question -> journal check-in ---- */
    U.on(root, 'click', '.coach-q [data-act="answer"]', function (e, b) {
      const box = b.closest('.coach-q');
      const input = U.$('.cq-input', box);
      const text = (input && input.value || '').trim();
      if (!text) return;
      const u = curUser();
      if (!u) return;
      Store.addJournalEntry({ userId: u.id, date: today(), entry: text, source: 'checkin' });
      // The question is answered — retire it so it cannot be answered twice.
      Store.updateChatMessage(box.getAttribute('data-q'), { question: '' });
      // The dossier changed, so the next request must rebuild it.
      C().resetDossierCache();
      App.toast('Saved to your journal — the coach will see it', 'ok');
      ask(text, { silent: true });
    });
  }

  /* ---------- commit: the ONLY path from a proposal into the Store ---------- */

  function commit(wrap, how) {
    const id = wrap.getAttribute('data-prop');
    const st = editState[id];
    if (!st) return;
    const u = curUser();
    if (!u) return;
    const msg = Store.chatFor(u.id).find(function (m) { return m.id === id; });
    if (!msg || !msg.proposal) return;

    const edited = {
      name: msg.proposal.name, kind: msg.proposal.kind,
      restSec: msg.proposal.restSec, rationale: msg.proposal.rationale,
      items: st.items
    };

    /* SECOND guardrail pass, at accept time. The log may have moved since the
       card was drawn — he may have trained between reading this and tapping
       the button — so the check that matters is this one. */
    const stops = stopFlags(checkProposal(edited, st.accepted));
    if (stops.length) {
      App.toast(stops[0].message || 'Blocked by your injury rules', 'err');
      App.rerender();
      return;
    }

    const routine = C().toRoutine(edited, st.accepted);
    if (!routine) { App.toast('Nothing selected to run', 'err'); return; }

    if (how === 'save') {
      Store.addRoutine({ userId: u.id, name: routine.name, kind: routine.kind,
        restSec: routine.restSec, items: routine.items });
      App.toast('Saved to your routines', 'ok');
      App.rerender();
      return;
    }

    // Hand off to the EXISTING guided-session path. A coach-proposed session
    // is structurally indistinguishable from a hand-built one, and P4.5's
    // one-live-session rule is untouched: Player.start owns that decision.
    if (window.Player && typeof Player.start === 'function') {
      Player.start(routine, { name: routine.name });
    } else {
      App.toast('Session player unavailable', 'err');
    }
  }

  /* ======================================================================
     Asking
     ====================================================================== */

  function ask(text, opts) {
    opts = opts || {};
    const u = curUser();
    if (!u || pending) return;
    const Co = C();

    Store.addChatMessage({ userId: u.id, role: 'user', text: text });
    pending = true;
    streamText = '';
    streamStartedAt = Date.now();
    // Repaint the waiting state each second so the elapsed count moves. A
    // frozen indicator is indistinguishable from a hung request.
    if (streamTick) clearInterval(streamTick);
    streamTick = setInterval(function () {
      if (!pending) { clearInterval(streamTick); streamTick = null; return; }
      if (!streamText) App.rerender();
    }, 1000);
    App.rerender();

    const t = today();
    const ctx = Co.contextFor(u.id, t);
    if (!ctx) { pending = false; App.rerender(); return; }
    const dossier = Co.dossierFor(ctx);

    // Thread MINUS the message just added — that one is the volatile turn.
    const prior = Store.chatFor(u.id);
    const thread = prior.slice(0, Math.max(0, prior.length - 1))
      .filter(function (m) { return !m.error; });

    Co.send({
      user: u,
      today: t,
      dossier: dossier.text,
      thread: thread,
      message: text,
      liveDraft: liveDraftSummary(),
      // Called as the reply arrives. Repaint only when the text actually
      // grew, so a burst of deltas does not thrash the DOM.
      onDelta: function (soFar) {
        if (typeof soFar !== 'string' || soFar === streamText) return;
        streamText = soFar;
        App.rerender();
      }
    }).then(function (res) {
      pending = false;
      streamText = '';
      if (streamTick) { clearInterval(streamTick); streamTick = null; }
      if (!res.ok) {
        Store.addChatMessage({ userId: u.id, role: 'assistant', text: '', error: res.error });
        App.rerender();
        return;
      }
      const proposal = res.proposalRaw
        ? Co.validateProposal(res.proposalRaw, { customExercises: Store.state.customExercises })
        : null;
      Store.addChatMessage({
        userId: u.id, role: 'assistant',
        text: res.reply || '',
        question: res.question || '',
        proposal: proposal,
        usage: res.usage
      });
      App.rerender();
    }).catch(function (e) {
      pending = false;
      streamText = '';
      if (streamTick) { clearInterval(streamTick); streamTick = null; }
      Store.addChatMessage({ userId: u.id, role: 'assistant', text: '',
        error: 'Something went wrong sending that. ' + String((e && e.message) || e) });
      App.rerender();
    });
  }

  // The live draft is volatile by definition, so it rides the final turn
  // rather than the cached dossier.
  function liveDraftSummary() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('ironlog/activeWorkout') || 'null'); }
    catch (e) { d = null; }
    if (!d || !Array.isArray(d.entries) || !d.entries.length) return '';
    const bits = d.entries.map(function (e) {
      const n = (e.sets || []).length;
      return (e.exerciseRef || e.exerciseId || e.type || '?') + ' ' + n + ' sets';
    });
    return (d.kind || 'workout') + ' in progress — ' + bits.join(', ');
  }

  /* ======================================================================
     Registration
     ====================================================================== */

  App.registerView('coach', {
    title: 'Coach',
    icon: COACH_ICON,
    nav: true,
    order: 58,
    // Performance mode AND a key. Without a key there is nothing to talk to;
    // without performance mode there is no guided session to hand a proposal
    // to (see the P6 mode-gate note in ARCHITECTURE.md).
    visible: function () {
      return App.isPerformance() && !!(window.Coach && Coach.hasKey());
    },
    render: renderCoach
  });

  // Settings needs to offer the key panel, and app.js owns Settings. Expose
  // the renderer rather than reaching into it.
  window.CoachSettings = { icon: COACH_ICON };
}());
