const STORAGE_KEY = "pomo-preferences-v2";
const CIRCUMFERENCE = 2 * Math.PI * 148;

const DEFAULTS = {
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  muted: false,
  ticking: false,
  autoStart: false,
  gridMotion: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  mode: "work",
  durations: { work: 25, short: 5, long: 15 },
  completedCount: 0,
  totalFocusMinutes: 0
};

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULTS,
      ...saved,
      durations: { ...DEFAULTS.durations, ...(saved.durations || {}) }
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

const preferences = readPreferences();
const state = {
  ...preferences,
  timeLeft: preferences.durations[preferences.mode] * 60,
  totalDuration: preferences.durations[preferences.mode] * 60,
  isRunning: false,
  timerId: null,
  endTime: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  html: document.documentElement,
  themeMeta: $('meta[name="theme-color"]'),
  timeDigits: $("#time-digits"),
  timerLabel: $("#timer-label"),
  timerOrbit: $(".timer-orbit"),
  progressRing: $("#progress-ring"),
  playButton: $("#btn-play-pause"),
  playText: $("#play-btn-text"),
  resetButton: $("#btn-reset"),
  skipButton: $("#btn-skip"),
  durationSlider: $("#duration-slider"),
  durationReadout: $("#duration-val-display"),
  chips: $$(".chip-btn[data-time]"),
  tabs: {
    work: $("#tab-work"),
    short: $("#tab-short"),
    long: $("#tab-long")
  },
  modeNav: $(".mode-nav"),
  statItems: $$(".stat-item"),
  statCount: $("#stat-count"),
  statMinutes: $("#stat-minutes"),
  themeButton: $("#btn-theme"),
  soundButton: $("#btn-sound"),
  settingsButton: $("#btn-settings"),
  modal: $("#modal-settings"),
  closeModalButton: $("#btn-close-modal"),
  modalSliders: {
    work: $("#modal-work-slider"),
    short: $("#modal-short-slider"),
    long: $("#modal-long-slider")
  },
  modalOutputs: {
    work: $("#modal-work-val"),
    short: $("#modal-short-val"),
    long: $("#modal-long-val")
  },
  autoStartToggle: $("#toggle-autostart"),
  tickingToggle: $("#toggle-ticking"),
  gridMotionToggle: $("#toggle-grid-motion"),
  resetStatsButton: $("#btn-reset-stats")
};

const MODE_LABELS = {
  work: "專注",
  short: "短休",
  long: "長休"
};

function savePreferences() {
  const payload = {
    theme: state.theme,
    muted: state.muted,
    ticking: state.ticking,
    autoStart: state.autoStart,
    gridMotion: state.gridMotion,
    mode: state.mode,
    durations: state.durations,
    completedCount: state.completedCount,
    totalFocusMinutes: state.totalFocusMinutes
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clampDuration(value) {
  return Math.min(120, Math.max(1, Number.parseInt(value, 10) || 1));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function setButtonIcon(button, iconName, labelText = null) {
  const oldIcon = button.querySelector("svg, i[data-lucide]");
  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  if (oldIcon) oldIcon.replaceWith(icon);
  else button.prepend(icon);
  if (labelText !== null) elements.playText.textContent = labelText;
  renderIcons();
}

let lucideApi = null;
function renderIcons() {
  if (!lucideApi) return;
  lucideApi.createIcons({
    icons: lucideApi.icons,
    attrs: { "stroke-width": 1.8 }
  });
}

function updateThemeUi() {
  elements.html.dataset.theme = state.theme;
  elements.themeMeta.content = state.theme === "dark" ? "#20211d" : "#e9e6de";
  elements.themeButton.setAttribute("aria-label", state.theme === "dark" ? "切換為淺色主題" : "切換為深色主題");
  setButtonIcon(elements.themeButton, state.theme === "dark" ? "moon" : "sun");
}

function updateSoundUi() {
  elements.soundButton.setAttribute("aria-label", state.muted ? "開啟聲音" : "靜音");
  elements.soundButton.setAttribute("aria-pressed", String(state.muted));
  setButtonIcon(elements.soundButton, state.muted ? "volume-x" : "volume-2");
}

function updateStatsUi() {
  elements.statCount.textContent = String(state.completedCount);
  elements.statMinutes.textContent = String(state.totalFocusMinutes);
}

function updateDisplay() {
  const formatted = formatTime(state.timeLeft);
  elements.timeDigits.textContent = formatted;
  elements.timeDigits.dateTime = `PT${state.timeLeft}S`;
  const progress = state.totalDuration ? state.timeLeft / state.totalDuration : 0;
  elements.progressRing.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
  document.title = `${formatted} · ${MODE_LABELS[state.mode]}`;
}

function updateModeUi() {
  Object.entries(elements.tabs).forEach(([mode, tab]) => {
    const active = mode === state.mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  const minutes = state.durations[state.mode];
  elements.timerLabel.textContent = MODE_LABELS[state.mode];
  elements.durationSlider.value = String(minutes);
  elements.durationReadout.textContent = `${minutes} 分`;
  elements.chips.forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.time) === minutes);
  });
}

function updateSettingsUi() {
  Object.keys(elements.modalSliders).forEach((mode) => {
    const minutes = state.durations[mode];
    elements.modalSliders[mode].value = String(minutes);
    elements.modalOutputs[mode].textContent = `${minutes} 分鐘`;
  });
  elements.autoStartToggle.checked = state.autoStart;
  elements.tickingToggle.checked = state.ticking;
  elements.gridMotionToggle.checked = state.gridMotion;
  elements.html.dataset.motion = state.gridMotion ? "moving" : "still";
}

function updatePlayUi() {
  setButtonIcon(elements.playButton, state.isRunning ? "pause" : "play", state.isRunning ? "暫停" : "開始");
  elements.playButton.setAttribute("aria-label", state.isRunning ? "暫停計時" : "開始計時");
}

class SoundEngine {
  constructor() {
    this.context = null;
  }

  init() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.context = new AudioContextClass();
    }
    if (this.context?.state === "suspended") this.context.resume();
  }

  click() {
    if (state.muted) return;
    this.tone({ frequency: 380, endFrequency: 180, duration: 0.045, volume: 0.055, type: "sine" });
  }

  tick() {
    if (state.muted || !state.ticking) return;
    this.tone({ frequency: 650, endFrequency: 520, duration: 0.018, volume: 0.012, type: "triangle" });
  }

  tone({ frequency, endFrequency, duration, volume, type }) {
    this.init();
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  alarm() {
    if (state.muted) return;
    [440, 554.37, 659.25].forEach((frequency, index) => {
      window.setTimeout(() => {
        this.tone({ frequency, endFrequency: frequency, duration: 0.55, volume: 0.09, type: "sine" });
      }, index * 130);
    });
  }
}

const sound = new SoundEngine();

function pauseTimer({ playSound = false } = {}) {
  if (playSound) sound.click();
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
  state.isRunning = false;
  state.endTime = null;
  updatePlayUi();
}

function setMode(mode, customMinutes = null) {
  if (!Object.hasOwn(elements.tabs, mode)) return;
  pauseTimer();
  state.mode = mode;
  if (customMinutes !== null) state.durations[mode] = clampDuration(customMinutes);
  state.totalDuration = state.durations[mode] * 60;
  state.timeLeft = state.totalDuration;
  updateModeUi();
  updateSettingsUi();
  updateDisplay();
  savePreferences();
}

function syncTimerToClock() {
  if (!state.isRunning || !state.endTime) return;
  const previous = state.timeLeft;
  state.timeLeft = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
  if (state.timeLeft !== previous) sound.tick();
  updateDisplay();
  if (state.timeLeft <= 0) completeTimer();
}

function startTimer() {
  if (state.isRunning) return;
  if (state.timeLeft <= 0) state.timeLeft = state.totalDuration;
  sound.click();
  state.isRunning = true;
  state.endTime = Date.now() + state.timeLeft * 1000;
  state.timerId = window.setInterval(syncTimerToClock, 250);
  updatePlayUi();
}

function resetTimer() {
  sound.click();
  pauseTimer();
  state.timeLeft = state.totalDuration;
  updateDisplay();
}

function nextMode() {
  if (state.mode === "work") return state.completedCount > 0 && state.completedCount % 4 === 0 ? "long" : "short";
  return "work";
}

function completeTimer(skipped = false) {
  pauseTimer();
  if (!skipped) {
    sound.alarm();
    if (state.mode === "work") {
      state.completedCount += 1;
      state.totalFocusMinutes += state.durations.work;
      updateStatsUi();
      savePreferences();
    }
  }

  const upcoming = nextMode();
  setMode(upcoming);
  if (state.autoStart && !skipped) window.setTimeout(startTimer, 1000);
}

function openSettings() {
  sound.click();
  updateSettingsUi();
  elements.modal.hidden = false;
  requestAnimationFrame(() => elements.modal.classList.add("open"));
  elements.closeModalButton.focus({ preventScroll: true });
}

function closeSettings() {
  elements.modal.classList.remove("open");
  window.setTimeout(() => {
    elements.modal.hidden = true;
    elements.settingsButton.focus({ preventScroll: true });
  }, 220);
}

function bindEvents() {
  elements.playButton.addEventListener("click", () => {
    if (state.isRunning) pauseTimer({ playSound: true });
    else startTimer();
  });
  elements.resetButton.addEventListener("click", resetTimer);
  elements.skipButton.addEventListener("click", () => {
    sound.click();
    completeTimer(true);
  });

  Object.entries(elements.tabs).forEach(([mode, tab]) => {
    tab.addEventListener("click", () => {
      sound.click();
      setMode(mode);
    });
  });

  elements.durationSlider.addEventListener("input", (event) => {
    setMode(state.mode, event.target.value);
  });

  elements.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      sound.click();
      setMode(state.mode, chip.dataset.time);
    });
  });

  elements.themeButton.addEventListener("click", () => {
    sound.click();
    state.theme = state.theme === "dark" ? "light" : "dark";
    updateThemeUi();
    savePreferences();
  });

  elements.soundButton.addEventListener("click", () => {
    state.muted = !state.muted;
    if (!state.muted) sound.click();
    updateSoundUi();
    savePreferences();
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.closeModalButton.addEventListener("click", () => {
    sound.click();
    closeSettings();
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeSettings();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) closeSettings();
    if (event.code === "Space" && elements.modal.hidden && event.target === document.body) {
      event.preventDefault();
      if (state.isRunning) pauseTimer({ playSound: true });
      else startTimer();
    }
  });

  Object.entries(elements.modalSliders).forEach(([mode, slider]) => {
    slider.addEventListener("input", (event) => {
      const minutes = clampDuration(event.target.value);
      state.durations[mode] = minutes;
      elements.modalOutputs[mode].textContent = `${minutes} 分鐘`;
      if (state.mode === mode && !state.isRunning) {
        state.totalDuration = minutes * 60;
        state.timeLeft = state.totalDuration;
        updateModeUi();
        updateDisplay();
      }
      savePreferences();
    });
  });

  elements.autoStartToggle.addEventListener("change", (event) => {
    state.autoStart = event.target.checked;
    savePreferences();
  });
  elements.tickingToggle.addEventListener("change", (event) => {
    state.ticking = event.target.checked;
    savePreferences();
  });
  elements.gridMotionToggle.addEventListener("change", (event) => {
    state.gridMotion = event.target.checked;
    elements.html.dataset.motion = state.gridMotion ? "moving" : "still";
    savePreferences();
  });

  elements.resetStatsButton.addEventListener("click", () => {
    sound.click();
    state.completedCount = 0;
    state.totalFocusMinutes = 0;
    updateStatsUi();
    savePreferences();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncTimerToClock();
  });
}

function mountReturnedSvgAssets(result) {
  Object.values(result ?? {}).forEach((value) => {
    if (value instanceof SVGElement) {
      value.setAttribute("data-liquid-glass-defs", "");
      document.body.appendChild(value);
      return;
    }
    if (typeof value !== "string" || !value.includes("<svg")) return;
    const template = document.createElement("template");
    template.innerHTML = value.trim();
    const svg = template.content.querySelector("svg");
    if (svg) {
      svg.setAttribute("data-liquid-glass-defs", "");
      document.body.appendChild(svg);
    }
  });
}

async function loadVisualEnhancements() {
  const [lucideResult, glassResult] = await Promise.allSettled([
    import("https://esm.sh/lucide@0.468.0"),
    import("https://esm.sh/solid-glass/engines/svg-refraction?bundle")
  ]);

  if (lucideResult.status === "fulfilled") {
    lucideApi = lucideResult.value;
    renderIcons();
    updateThemeUi();
    updateSoundUi();
    updatePlayUi();
  }

  if (glassResult.status !== "fulfilled") return;
  const { createLiquidGlass } = glassResult.value;
  const renderScale = Math.min(8, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));

  function applyLiquidGlassTo(button, width, height, radius) {
    if (!button) return;
    const glass = createLiquidGlass({
      width,
      height,
      radius,
      bezelWidth: Math.max(6, Math.round(width * 0.06)),
      glassThickness: 120,
      blur: 1.5,
      refractiveIndex: 1.2,
      surface: "convexCircle",
      specularOpacity: 0.8,
      dpr: renderScale
    });

    mountReturnedSvgAssets(glass);
    if (glass?.filterRef) {
      const filter = `${glass.filterRef} saturate(100%)`;
      button.style.backdropFilter = filter;
      button.style.webkitBackdropFilter = filter;
    }
  }

  applyLiquidGlassTo(elements.soundButton, 42, 42, 21);
  applyLiquidGlassTo(elements.themeButton, 42, 42, 21);
  applyLiquidGlassTo(elements.settingsButton, 42, 42, 21);
  applyLiquidGlassTo(elements.closeModalButton, 42, 42, 21);
  applyLiquidGlassTo(elements.playButton, 178, 68, 34);
  applyLiquidGlassTo(elements.resetButton, 62, 54, 27);
  applyLiquidGlassTo(elements.skipButton, 62, 54, 27);

  const measuredGlassTargets = [
    { element: elements.timerOrbit, radius: "circle" },
    { element: elements.modeNav, radius: 22 },
    ...Object.values(elements.tabs).map((element) => ({ element, radius: 17 })),
    ...elements.chips.map((element) => ({ element, radius: 18 })),
    ...elements.statItems.map((element) => ({ element, radius: 16 }))
  ];

  measuredGlassTargets.forEach(({ element, radius }) => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const resolvedRadius = radius === "circle" ? Math.round(Math.min(width, height) / 2) : radius;
    applyLiquidGlassTo(element, width, height, resolvedRadius);
  });

  $$(".scene").forEach((scene) => {
    const card = scene.querySelector(".refraction-card");
    if (!card) return;
    const baseTransform = getComputedStyle(card).transform === "none" ? "" : card.style.transform;
    scene.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const rect = scene.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      card.style.transform = `${baseTransform} translate(${Math.round(x * 0.18)}px, ${Math.round(y * 0.18)}px)`;
    });
    scene.addEventListener("pointerleave", () => {
      card.style.transform = baseTransform;
    });
  });
}

function initialize() {
  elements.progressRing.style.strokeDasharray = String(CIRCUMFERENCE);
  updateThemeUi();
  updateSoundUi();
  updateStatsUi();
  updateModeUi();
  updateSettingsUi();
  updatePlayUi();
  updateDisplay();
  bindEvents();
  loadVisualEnhancements();
}

initialize();
