/* ============================================================
   Air Tracker — app.js
   Store-pattern, light/dark, gauge, history, heatmap, modals.
   v1 ships with the "air" maintenance item only, but data shape
   is already array-of-bikes / array-of-items for future expansion.
   ============================================================ */

(() => {
  'use strict';

  // ----- Constants -----
  const STORAGE_KEY = 'airTracker';
  const STORAGE_VERSION = 2;
  const MS_PER_DAY = 86_400_000;
  const HISTORY_LIMIT_FREE = 30;
  const MIN_INTERVAL = 1;
  const MAX_INTERVAL = 365;
  const PRESET_INTERVALS = [7, 14, 21, 30];
  const HEATMAP_DAYS = 91; // about 3 months
  const LONG_PRESS_MS = 500;
  const COUNT_UP_MS = 700;
  const DEFAULT_BIKE_NAME = 'マイバイク';

  // ----- Helpers: dates (local timezone safe) -----
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const daysBetween = (from, to) =>
    Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
  const formatYMD = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`;
  };
  const formatYMDForInput = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const weekdayJP = (d) => ['日', '月', '火', '水', '木', '金', '土'][new Date(d).getDay()];

  // ----- Default state -----
  const makeDefaultState = () => ({
    version: STORAGE_VERSION,
    bikes: [{
      id: 'bike-1',
      name: DEFAULT_BIKE_NAME,
      items: [{
        type: 'air',
        lastReset: null,
        intervalDays: 14,
        history: [],
      }],
    }],
    settings: {
      theme: 'auto', // 'auto' | 'light' | 'dark'
      isPremium: false,
      activeBikeId: 'bike-1',
    },
  });

  // ----- Migration from v1 (flat shape) -----
  const migrate = (raw) => {
    if (!raw || typeof raw !== 'object') return makeDefaultState();
    if (raw.version === STORAGE_VERSION && Array.isArray(raw.bikes)) return raw;
    // v1 shape: { lastPump, intervalDays, history }
    const def = makeDefaultState();
    const item = def.bikes[0].items[0];
    if (raw.lastPump) item.lastReset = raw.lastPump;
    if (raw.intervalDays) item.intervalDays = raw.intervalDays;
    if (Array.isArray(raw.history)) {
      item.history = raw.history.map((d) => ({ date: typeof d === 'string' ? d : (d?.date || null) }))
        .filter((h) => h.date);
    }
    return def;
  };

  // ----- Store -----
  const store = {
    state: makeDefaultState(),
    listeners: new Set(),

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.state = migrate(JSON.parse(raw));
      } catch (e) {
        console.warn('Failed to load state', e);
        this.state = makeDefaultState();
      }
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        if (e?.name === 'QuotaExceededError') toast('保存容量が不足しています');
        else toast('保存に失敗しました');
        console.warn('Failed to save state', e);
      }
    },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    notify() { this.listeners.forEach((fn) => fn(this.state)); },
    update(mutator) {
      mutator(this.state);
      this.save();
      this.notify();
    },

    // Convenience
    activeBike() {
      return this.state.bikes.find((b) => b.id === this.state.settings.activeBikeId) || this.state.bikes[0];
    },
    activeAirItem() {
      const bike = this.activeBike();
      return bike.items.find((it) => it.type === 'air');
    },
  };

  // ----- DOM refs -----
  const $ = (id) => document.getElementById(id);
  const dom = {
    bikeName: $('bike-name'),
    settingsBtn: $('settings-btn'),

    gaugeTrack: $('gauge-track'),
    gaugeFill: $('gauge-fill'),
    gaugeNum: $('gauge-num'),
    gaugePrefix: $('gauge-prefix'),
    gaugeSuffix: $('gauge-suffix'),
    gaugeSub: $('gauge-sub'),
    gaugeHint: $('gauge-hint'),
    gaugeStatusSr: $('gauge-status-sr'),

    intervalSegment: $('interval-segment'),
    historyLink: $('history-link'),

    actionBtn: $('action-btn'),

    // Reset modal
    resetOverlay: $('reset-overlay'),
    resetClose: $('reset-close'),
    resetConfirm: $('reset-confirm'),
    resetCancel: $('reset-cancel'),
    dateChoiceToday: $('date-choice-today'),
    dateChoiceYesterday: $('date-choice-yesterday'),
    dateChoiceCustom: $('date-choice-custom'),
    dateInputRow: $('date-input-row'),
    dateInput: $('date-input'),

    // Custom interval modal
    customOverlay: $('custom-overlay'),
    customClose: $('custom-close'),
    customConfirm: $('custom-confirm'),
    customCancel: $('custom-cancel'),
    customDec: $('custom-dec'),
    customInc: $('custom-inc'),
    customInput: $('custom-input'),

    // History modal
    historyOverlay: $('history-overlay'),
    historyClose: $('history-close'),
    historyAvg: $('history-avg'),
    historyCount: $('history-count'),
    historyStreak: $('history-streak'),
    historyTrend: $('history-trend'),
    heatmap: $('heatmap'),
    historyList: $('history-list'),
    historyFooter: $('history-footer'),

    // Settings modal
    settingsOverlay: $('settings-overlay'),
    settingsClose: $('settings-close'),
    settingsBikeName: $('settings-bike-name'),
    themeGroup: $('theme-group'),
    settingsExport: $('settings-export'),
    settingsImport: $('settings-import'),
    settingsImportFile: $('settings-import-file'),

    // Upgrade modal
    upgradeOverlay: $('upgrade-overlay'),
    upgradeClose: $('upgrade-close'),
    upgradeOk: $('upgrade-ok'),

    // Toast
    toast: $('toast'),
  };

  // ----- Toast -----
  let toastTimer = null;
  function toast(msg, ms = 2400) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), ms);
  }

  // ----- Theme -----
  function applyTheme(theme) {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    // theme-color meta for native chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const styles = getComputedStyle(document.documentElement);
      const bg = styles.getPropertyValue('--bg').trim();
      if (bg) meta.setAttribute('content', bg);
    }
  }

  // ----- Gauge math -----
  // SVG circle r=80 in viewBox 200x200, centered (100,100)
  // Track is a full ring; fill uses stroke-dasharray + dashoffset.
  const RADIUS = 80;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  function setupGaugeStaticAttributes() {
    [dom.gaugeTrack, dom.gaugeFill].forEach((el) => {
      if (!el) return;
      el.setAttribute('r', RADIUS);
      el.setAttribute('cx', '100');
      el.setAttribute('cy', '100');
      el.setAttribute('stroke-dasharray', CIRCUMFERENCE);
    });
    if (dom.gaugeFill) {
      dom.gaugeFill.setAttribute('stroke-dashoffset', CIRCUMFERENCE); // 0% initially
      // Rotate so progression starts from top (12 o'clock)
      dom.gaugeFill.setAttribute('transform', 'rotate(-90 100 100)');
      dom.gaugeTrack.setAttribute('transform', 'rotate(-90 100 100)');
    }
  }

  // ----- Number animation (count-up) -----
  function animateNumber(el, from, to, duration = COUNT_UP_MS) {
    if (prefersReducedMotion()) {
      el.textContent = String(to);
      return;
    }
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * ease(t));
      el.textContent = String(v);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ----- Render: header / bike name -----
  function renderHeader(state) {
    const bike = store.activeBike();
    dom.bikeName.textContent = bike.name || DEFAULT_BIKE_NAME;
  }

  // ----- Render: gauge -----
  let lastDisplayedNumber = 0;
  function renderGauge(state) {
    const item = store.activeAirItem();
    const interval = item.intervalDays;
    const lastReset = item.lastReset ? new Date(item.lastReset) : null;
    const now = new Date();

    if (!lastReset) {
      // Onboarding: first launch, no record yet
      dom.gaugeNum.textContent = '？';
      dom.gaugeNum.classList.add('is-empty');
      dom.gaugeNum.classList.remove('is-overdue', 'is-pulse');
      dom.gaugePrefix.textContent = '';
      dom.gaugeSuffix.textContent = '';
      dom.gaugeSub.textContent = '';
      dom.gaugeHint.textContent = '空気を入れたら下のボタンを押してください';
      dom.gaugeFill.setAttribute('stroke-dashoffset', CIRCUMFERENCE);
      dom.gaugeFill.style.stroke = 'var(--text-faint)';
      dom.gaugeStatusSr.textContent = '記録なし';
      lastDisplayedNumber = 0;
      return;
    }

    const elapsed = daysBetween(lastReset, now);
    const remaining = interval - elapsed;
    const ratio = Math.min(elapsed / interval, 1.2);
    const fillRatio = Math.min(elapsed / interval, 1);

    // Color & message
    let strokeColor, statusText;
    const remainPct = remaining / interval;
    if (remaining < 0) {
      // Overdue
      strokeColor = 'var(--danger)';
      dom.gaugeNum.classList.add('is-overdue', 'is-pulse');
      dom.gaugePrefix.textContent = '';
      dom.gaugeSuffix.textContent = '日 超過';
      statusText = `${Math.abs(remaining)}日超過`;
    } else if (remainPct < 0.15) {
      strokeColor = 'var(--danger)';
      dom.gaugeNum.classList.remove('is-overdue');
      dom.gaugeNum.classList.add('is-pulse');
      dom.gaugePrefix.textContent = 'あと';
      dom.gaugeSuffix.textContent = '日';
      statusText = `あと${remaining}日 / 要対応`;
    } else if (remainPct < 0.5) {
      strokeColor = 'var(--warn)';
      dom.gaugeNum.classList.remove('is-overdue', 'is-pulse');
      dom.gaugePrefix.textContent = 'あと';
      dom.gaugeSuffix.textContent = '日';
      statusText = `あと${remaining}日 / 注意`;
    } else {
      strokeColor = 'var(--ok)';
      dom.gaugeNum.classList.remove('is-overdue', 'is-pulse');
      dom.gaugePrefix.textContent = 'あと';
      dom.gaugeSuffix.textContent = '日';
      statusText = `あと${remaining}日 / 快適`;
    }

    dom.gaugeNum.classList.remove('is-empty');
    dom.gaugeFill.style.stroke = strokeColor;
    dom.gaugeFill.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - fillRatio)));

    const targetNumber = remaining < 0 ? Math.abs(remaining) : remaining;
    animateNumber(dom.gaugeNum, lastDisplayedNumber, targetNumber);
    lastDisplayedNumber = targetNumber;

    dom.gaugeSub.textContent = `前回から ${elapsed} 日経過`;
    dom.gaugeHint.textContent = '';
    dom.gaugeStatusSr.textContent = statusText;
  }

  // ----- Render: interval segment -----
  function renderIntervalSegment(state) {
    const item = store.activeAirItem();
    const isPreset = PRESET_INTERVALS.includes(item.intervalDays);
    [...dom.intervalSegment.querySelectorAll('.interval__btn')].forEach((btn) => {
      const days = btn.dataset.days;
      const isCustom = btn.dataset.custom === 'true';
      let pressed;
      if (isCustom) pressed = !isPreset; // active when current value is non-preset
      else pressed = parseInt(days, 10) === item.intervalDays;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (isCustom && !isPreset) {
        // show current custom value
        const lbl = btn.querySelector('.interval__label-num');
        if (lbl) lbl.textContent = String(item.intervalDays);
      } else if (isCustom) {
        const lbl = btn.querySelector('.interval__label-num');
        if (lbl) lbl.textContent = 'カスタム';
      }
    });
  }

  // ----- Render: settings sheet (when open) -----
  function renderSettings(state) {
    const bike = store.activeBike();
    if (dom.settingsBikeName) dom.settingsBikeName.value = bike.name || '';
    if (dom.themeGroup) {
      [...dom.themeGroup.querySelectorAll('button')].forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.dataset.theme === state.settings.theme ? 'true' : 'false');
      });
    }
  }

  // ----- Render: history sheet -----
  function renderHistory(state) {
    if (!dom.historyOverlay.classList.contains('is-open')) return;
    const item = store.activeAirItem();
    const events = collectEvents(item);
    renderHistorySummary(item, events);
    renderHeatmap(events);
    renderHistoryList(item, events);
    dom.historyFooter.textContent = state.settings.isPremium
      ? '全期間の履歴を保存中'
      : `最新 ${HISTORY_LIMIT_FREE} 件まで保存`;
  }

  // Compose chronological events: history[] entries + current lastReset (most recent)
  function collectEvents(item) {
    const events = [];
    if (Array.isArray(item.history)) {
      for (const h of item.history) {
        if (h?.date) events.push(new Date(h.date));
      }
    }
    if (item.lastReset) events.push(new Date(item.lastReset));
    events.sort((a, b) => b - a); // newest first
    return events;
  }

  function renderHistorySummary(item, events) {
    if (events.length < 2) {
      dom.historyAvg.textContent = '—';
      dom.historyCount.textContent = String(events.length);
      dom.historyStreak.textContent = '—';
      dom.historyTrend.textContent = '空気入れの記録が増えると傾向が表示されます。';
      return;
    }
    const recent = events.slice(0, Math.min(events.length, 11));
    const intervals = [];
    for (let i = 0; i < recent.length - 1; i++) {
      intervals.push(daysBetween(recent[i + 1], recent[i]));
    }
    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    dom.historyAvg.textContent = avg.toFixed(1);
    dom.historyCount.textContent = String(events.length);

    // Streak: consecutive resets within intervalDays
    let streak = 0;
    for (const gap of intervals) {
      if (gap <= item.intervalDays) streak++;
      else break;
    }
    dom.historyStreak.textContent = String(streak);

    // Trend message
    let trendMsg;
    const earlierAvg = intervals.length >= 6
      ? intervals.slice(3).reduce((s, v) => s + v, 0) / (intervals.length - 3)
      : null;
    const latestAvg = intervals.length >= 6
      ? intervals.slice(0, 3).reduce((s, v) => s + v, 0) / 3
      : null;
    if (latestAvg != null && earlierAvg != null) {
      if (latestAvg < earlierAvg - 1) trendMsg = '最近は早めにメンテしているようです ✨';
      else if (latestAvg > earlierAvg + 1) trendMsg = '最近は少し間隔があいてきています';
      else trendMsg = '安定したペースでメンテできています';
    } else {
      trendMsg = `平均 ${avg.toFixed(1)} 日に1回のペースです`;
    }
    if (streak >= 3) trendMsg += ` / ${streak}回連続で設定サイクル内達成中`;
    dom.historyTrend.textContent = trendMsg;
  }

  function renderHeatmap(events) {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d);
    }
    // Pad start to align with Sunday at top of column
    const padStart = days[0].getDay(); // 0=Sun
    const cells = [];
    for (let i = 0; i < padStart; i++) cells.push({ pad: true });
    for (const d of days) {
      const ymd = formatYMD(d);
      const has = events.some((e) => formatYMD(e) === ymd);
      cells.push({ date: d, level: has ? 2 : 0 });
    }
    // light "trail" around event cells (visual continuity)
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].level === 2) {
        for (let j = -1; j <= 1; j++) {
          const k = i + j;
          if (j !== 0 && cells[k] && !cells[k].pad && cells[k].level === 0) cells[k].level = 1;
        }
      }
    }
    dom.heatmap.innerHTML = `
      <div class="heatmap__grid" role="presentation">
        ${cells.map((c) => {
          if (c.pad) return `<div class="heatmap__cell is-future" aria-hidden="true"></div>`;
          const lvl = c.level || 0;
          const title = `${formatYMD(c.date)}${lvl === 2 ? ' 空気入れ' : ''}`;
          return `<div class="heatmap__cell lvl-${lvl}" title="${title}"></div>`;
        }).join('')}
      </div>
      <div class="heatmap__legend" aria-hidden="true">
        <span class="heatmap__cell lvl-0"></span>
        <span>少</span>
        <span class="heatmap__cell lvl-1"></span>
        <span class="heatmap__cell lvl-2"></span>
        <span>多</span>
      </div>
    `;
  }

  function renderHistoryList(item, events) {
    if (!events.length) {
      dom.historyList.innerHTML = `<div class="history-empty">まだ記録がありません</div>`;
      return;
    }
    // Build list with "interval from previous"
    const html = events.map((d, i) => {
      const next = events[i + 1];
      const interval = next ? daysBetween(next, d) : null;
      const intervalLabel = interval == null ? '初回' : `${interval} 日間`;
      const ymd = formatYMD(d);
      const wd = weekdayJP(d);
      const idx = i; // for editing/deleting reference (newest=0)
      return `
        <div class="history-item" data-idx="${idx}" tabindex="0" role="button" aria-label="${ymd} ${wd}曜日 前回から${intervalLabel}">
          <div>
            <span class="history-item__date">${ymd}</span>
            <span class="history-item__weekday">(${wd})</span>
          </div>
          <div class="history-item__interval">${intervalLabel}</div>
          <div class="history-item__actions">
            <button class="js-edit" data-idx="${idx}">📝 編集</button>
            <button class="js-delete danger" data-idx="${idx}">🗑️ 削除</button>
          </div>
        </div>
      `;
    }).join('');
    dom.historyList.innerHTML = html;
    bindHistoryItemEvents();
  }

  function bindHistoryItemEvents() {
    [...dom.historyList.querySelectorAll('.history-item')].forEach((el) => {
      let pressTimer = null;
      let pressed = false;
      const startPress = () => {
        pressed = false;
        el.classList.add('is-pressing');
        pressTimer = setTimeout(() => {
          pressed = true;
          el.classList.add('is-expanded');
          // close others
          [...dom.historyList.querySelectorAll('.history-item')].forEach((other) => {
            if (other !== el) other.classList.remove('is-expanded');
          });
        }, LONG_PRESS_MS);
      };
      const endPress = () => {
        clearTimeout(pressTimer);
        el.classList.remove('is-pressing');
      };
      el.addEventListener('pointerdown', startPress);
      el.addEventListener('pointerup', endPress);
      el.addEventListener('pointerleave', endPress);
      el.addEventListener('pointercancel', endPress);
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        el.classList.add('is-expanded');
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.classList.toggle('is-expanded');
        }
      });
    });

    [...dom.historyList.querySelectorAll('.js-edit')].forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        promptEditHistory(idx);
      });
    });
    [...dom.historyList.querySelectorAll('.js-delete')].forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        confirmDeleteHistory(idx);
      });
    });
  }

  function eventsListMutate(mutator) {
    store.update((state) => {
      const item = state.bikes.find((b) => b.id === state.settings.activeBikeId).items.find((it) => it.type === 'air');
      const events = collectEvents(item); // newest first
      const updated = mutator(events);
      // The newest event becomes lastReset; the rest go to history (newest first)
      if (updated.length === 0) {
        item.lastReset = null;
        item.history = [];
      } else {
        item.lastReset = updated[0].toISOString();
        item.history = updated.slice(1).map((d) => ({ date: d.toISOString() }));
        if (item.history.length > HISTORY_LIMIT_FREE - 1) {
          item.history = item.history.slice(0, HISTORY_LIMIT_FREE - 1);
        }
      }
    });
  }

  function promptEditHistory(idx) {
    const item = store.activeAirItem();
    const events = collectEvents(item);
    const target = events[idx];
    if (!target) return;
    const newYmd = window.prompt('日付を入力してください (YYYY-MM-DD)', formatYMDForInput(target));
    if (!newYmd) return;
    const parsed = parseYMD(newYmd);
    if (!parsed) { toast('日付の形式が正しくありません'); return; }
    eventsListMutate((events) => {
      events[idx] = parsed;
      events.sort((a, b) => b - a);
      return events;
    });
    toast('履歴を更新しました');
    renderHistory(store.state);
  }

  function confirmDeleteHistory(idx) {
    const item = store.activeAirItem();
    const events = collectEvents(item);
    const target = events[idx];
    if (!target) return;
    if (!window.confirm(`${formatYMD(target)} の記録を削除しますか？`)) return;
    eventsListMutate((events) => {
      events.splice(idx, 1);
      return events;
    });
    toast('履歴を削除しました');
    renderHistory(store.state);
  }

  function parseYMD(s) {
    const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) || String(s).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // ----- Modal helpers -----
  let lastFocused = null;
  function openModal(overlay) {
    lastFocused = document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    // focus first focusable
    const focusable = overlay.querySelector('button, [tabindex]:not([tabindex="-1"]), input, [href]');
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }
  function closeModal(overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (e) {}
    }
  }
  function bindOverlayDismiss(overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  }

  // ----- Reset modal logic -----
  let pendingResetMode = 'today'; // 'today' | 'yesterday' | 'custom'
  function openResetModal() {
    pendingResetMode = 'today';
    setResetMode('today');
    dom.dateInput.value = formatYMDForInput(new Date());
    openModal(dom.resetOverlay);
  }
  function setResetMode(mode) {
    pendingResetMode = mode;
    [
      [dom.dateChoiceToday, 'today'],
      [dom.dateChoiceYesterday, 'yesterday'],
      [dom.dateChoiceCustom, 'custom'],
    ].forEach(([btn, m]) => btn.setAttribute('aria-pressed', mode === m ? 'true' : 'false'));
    dom.dateInputRow.classList.toggle('is-visible', mode === 'custom');
  }
  function performReset() {
    const now = new Date();
    let targetDate;
    if (pendingResetMode === 'today') targetDate = now;
    else if (pendingResetMode === 'yesterday') {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() - 1);
    } else {
      const parsed = parseYMD(dom.dateInput.value);
      if (!parsed) { toast('日付を選んでください'); return; }
      // Preserve current time-of-day for the custom date (helps with sorting precision)
      parsed.setHours(now.getHours(), now.getMinutes(), 0, 0);
      targetDate = parsed;
    }
    // Reject future dates
    if (startOfDay(targetDate).getTime() > startOfDay(now).getTime()) {
      toast('未来の日付は選べません');
      return;
    }

    store.update((state) => {
      const item = state.bikes.find((b) => b.id === state.settings.activeBikeId).items.find((it) => it.type === 'air');
      // Push current lastReset to history if any; replace lastReset with targetDate.
      if (item.lastReset) {
        item.history = item.history || [];
        item.history.unshift({ date: item.lastReset });
        if (item.history.length > HISTORY_LIMIT_FREE - 1) {
          item.history = item.history.slice(0, HISTORY_LIMIT_FREE - 1);
        }
      }
      item.lastReset = targetDate.toISOString();
    });
    closeModal(dom.resetOverlay);
    lastDisplayedNumber = 0; // reset count-up
    toast('記録しました');
  }

  // ----- Custom interval modal -----
  function openCustomModal() {
    if (!store.state.settings.isPremium) {
      openModal(dom.upgradeOverlay);
      return;
    }
    const item = store.activeAirItem();
    dom.customInput.value = item.intervalDays;
    openModal(dom.customOverlay);
  }
  function clampInterval(n) { return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n | 0)); }
  function adjustCustom(delta) {
    const v = clampInterval((parseInt(dom.customInput.value, 10) || 0) + delta);
    dom.customInput.value = v;
  }
  function applyCustom() {
    const v = clampInterval(parseInt(dom.customInput.value, 10));
    if (!v) { toast('日数を入力してください'); return; }
    store.update((state) => {
      const item = state.bikes.find((b) => b.id === state.settings.activeBikeId).items.find((it) => it.type === 'air');
      item.intervalDays = v;
    });
    closeModal(dom.customOverlay);
  }

  // ----- Settings modal -----
  function openSettingsModal() {
    renderSettings(store.state);
    openModal(dom.settingsOverlay);
  }
  function applyBikeNameChange() {
    const v = (dom.settingsBikeName.value || '').trim().slice(0, 40);
    if (!v) return;
    store.update((state) => { state.bikes.find((b) => b.id === state.settings.activeBikeId).name = v; });
  }
  function setTheme(theme) {
    store.update((state) => { state.settings.theme = theme; });
    applyTheme(theme);
  }

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = formatYMDForInput(new Date());
      a.href = url;
      a.download = `air-tracker-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('バックアップを書き出しました');
    } catch (e) {
      toast('書き出しに失敗しました');
    }
  }

  function importData() {
    dom.settingsImportFile.click();
  }
  function onImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const migrated = migrate(parsed);
        if (!Array.isArray(migrated.bikes) || !migrated.bikes[0]) throw new Error('invalid');
        if (!window.confirm('現在のデータを上書きしてインポートします。よろしいですか？')) return;
        store.state = migrated;
        store.save();
        store.notify();
        applyTheme(store.state.settings.theme);
        toast('データを復元しました');
        closeModal(dom.settingsOverlay);
      } catch (err) {
        toast('JSONの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  }

  // ----- Event wiring -----
  function bindEvents() {
    // Header
    dom.settingsBtn.addEventListener('click', openSettingsModal);

    // Action button
    dom.actionBtn.addEventListener('click', openResetModal);

    // History link
    dom.historyLink.addEventListener('click', () => {
      renderHistory(store.state);
      openModal(dom.historyOverlay);
    });

    // Interval segment
    dom.intervalSegment.addEventListener('click', (e) => {
      const btn = e.target.closest('.interval__btn');
      if (!btn) return;
      if (btn.dataset.custom === 'true') {
        openCustomModal();
        return;
      }
      const days = parseInt(btn.dataset.days, 10);
      if (!days) return;
      store.update((state) => {
        const item = state.bikes.find((b) => b.id === state.settings.activeBikeId).items.find((it) => it.type === 'air');
        item.intervalDays = days;
      });
    });

    // Reset modal
    dom.dateChoiceToday.addEventListener('click', () => setResetMode('today'));
    dom.dateChoiceYesterday.addEventListener('click', () => setResetMode('yesterday'));
    dom.dateChoiceCustom.addEventListener('click', () => setResetMode('custom'));
    dom.resetConfirm.addEventListener('click', performReset);
    dom.resetCancel.addEventListener('click', () => closeModal(dom.resetOverlay));
    dom.resetClose.addEventListener('click', () => closeModal(dom.resetOverlay));
    bindOverlayDismiss(dom.resetOverlay);

    // Custom interval modal
    dom.customDec.addEventListener('click', () => adjustCustom(-1));
    dom.customInc.addEventListener('click', () => adjustCustom(+1));
    dom.customConfirm.addEventListener('click', applyCustom);
    dom.customCancel.addEventListener('click', () => closeModal(dom.customOverlay));
    dom.customClose.addEventListener('click', () => closeModal(dom.customOverlay));
    bindOverlayDismiss(dom.customOverlay);

    // History modal
    dom.historyClose.addEventListener('click', () => closeModal(dom.historyOverlay));
    bindOverlayDismiss(dom.historyOverlay);

    // Settings modal
    dom.settingsClose.addEventListener('click', () => closeModal(dom.settingsOverlay));
    bindOverlayDismiss(dom.settingsOverlay);
    dom.settingsBikeName.addEventListener('change', applyBikeNameChange);
    dom.settingsBikeName.addEventListener('blur', applyBikeNameChange);
    dom.themeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-theme]');
      if (!btn) return;
      setTheme(btn.dataset.theme);
    });
    dom.settingsExport.addEventListener('click', exportData);
    dom.settingsImport.addEventListener('click', importData);
    dom.settingsImportFile.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) onImportFile(file);
      dom.settingsImportFile.value = '';
    });

    // Upgrade modal
    dom.upgradeClose.addEventListener('click', () => closeModal(dom.upgradeOverlay));
    dom.upgradeOk.addEventListener('click', () => closeModal(dom.upgradeOverlay));
    bindOverlayDismiss(dom.upgradeOverlay);

    // ESC closes any open overlay
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      [dom.resetOverlay, dom.customOverlay, dom.historyOverlay, dom.settingsOverlay, dom.upgradeOverlay]
        .forEach((ov) => { if (ov.classList.contains('is-open')) closeModal(ov); });
    });

    // System theme change
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => {
      if (store.state.settings.theme === 'auto') applyTheme('auto');
    });
  }

  // ----- Re-render hook -----
  function render(state) {
    renderHeader(state);
    renderGauge(state);
    renderIntervalSegment(state);
    if (dom.historyOverlay.classList.contains('is-open')) renderHistory(state);
    if (dom.settingsOverlay.classList.contains('is-open')) renderSettings(state);
  }

  // ----- Boot -----
  function boot() {
    store.load();
    applyTheme(store.state.settings.theme || 'auto');
    setupGaugeStaticAttributes();
    bindEvents();
    store.subscribe(render);
    render(store.state);
    // Re-render every minute so date crossings flip the count
    setInterval(() => render(store.state), 60_000);

    // Service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
