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
  workSessionsSinceLongBreak: 0,
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
  modeSlider: $(".mode-slider"),
  presetNav: $(".preset-chips"),
  presetSlider: $(".preset-slider"),
  statItems: $$(".stat-item"),
  statCount: $("#stat-count"),
  statMinutes: $("#stat-minutes"),
  focusBoard: $("#mobile-content"),
  mobileNav: $(".mobile-bottom-nav"),
  mobileNavSlider: $(".mobile-nav-slider"),
  mobileNavButtons: $$(".mobile-nav-btn[data-mobile-view]"),
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

const mobileMedia = matchMedia("(max-width: 640px)");
let mobileView = "timer";
let lastMobileContentView = "timer";
let refreshLiquidGlassLayout = () => {};

function updateMobileNavigation() {
  elements.focusBoard.dataset.mobileView = lastMobileContentView;
  elements.mobileNavButtons.forEach((button) => {
    const active = button.dataset.mobileView === mobileView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (mobileMedia.matches) {
    requestAnimationFrame(() => {
      const activeButton = elements.mobileNavButtons.find((button) => button.dataset.mobileView === mobileView);
      positionPillSlider({
        container: elements.mobileNav,
        slider: elements.mobileNavSlider,
        target: activeButton,
        animate: true
      });
      positionModeSlider(false);
      positionPresetSlider(false);
    });
  }

  refreshLiquidGlassLayout();
}

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
    workSessionsSinceLongBreak: state.workSessionsSinceLongBreak,
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

let renderedMode = null;
let renderedPresetTime = null;
const pillSliderAnimations = new WeakMap();

function positionPillSlider({ container, slider, target, animate, maxExtra = 0, extraRatio = 0 }) {
  requestAnimationFrame(() => {
    if (!container || !slider) return;

    if (!target) {
      slider.style.opacity = "0";
      return;
    }

    const navRect = container.getBoundingClientRect();
    const tabRect = target.getBoundingClientRect();
    const currentRect = slider.getBoundingClientRect();
    const isVisible = getComputedStyle(slider).opacity !== "0" && currentRect.width > 0;

    const navPadding = Number.parseFloat(getComputedStyle(container).paddingLeft) || 0;
    const extraWidth = Math.min(maxExtra, tabRect.width * extraRatio);
    const targetWidth = tabRect.width + extraWidth;
    const unclampedLeft = tabRect.left - navRect.left - extraWidth / 2;
    const targetLeft = Math.max(navPadding, Math.min(unclampedLeft, navRect.width - navPadding - targetWidth));

    const currentLeft = isVisible ? currentRect.left - navRect.left : targetLeft;
    const currentWidth = isVisible ? currentRect.width : targetWidth;

    if (!animate || !isVisible || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      slider.style.transition = "none";
      slider.style.opacity = "1";
      slider.style.left = `${targetLeft}px`;
      slider.style.width = `${targetWidth}px`;
      slider.style.transform = "none";
      return;
    }

    const deltaX = currentLeft - targetLeft;
    const scaleX = currentWidth / targetWidth;

    if (Math.abs(deltaX) < 0.5 && Math.abs(scaleX - 1) < 0.01) {
      return;
    }

    // Set FLIP start state without transition
    slider.style.transition = "none";
    slider.style.opacity = "1";
    slider.style.left = `${targetLeft}px`;
    slider.style.width = `${targetWidth}px`;
    slider.style.transformOrigin = deltaX >= 0 ? "left center" : "right center";
    slider.style.transform = `translate3d(${deltaX}px, 0, 0) scale3d(${scaleX}, 1, 1)`;

    // Force browser style reflow to commit FLIP start frame
    void slider.offsetHeight;

    // GPU-accelerated liquid spring transition
    slider.style.transition = "transform 380ms cubic-bezier(0.22, 1.25, 0.36, 1), opacity 150ms ease";
    slider.style.transform = "translate3d(0, 0, 0) scale3d(1, 1, 1)";
  });
}

function positionModeSlider(animate = false) {
  positionPillSlider({
    container: elements.modeNav,
    slider: elements.modeSlider,
    target: elements.tabs[state.mode],
    animate
  });
}

function positionPresetSlider(animate = false) {
  const activeChip = elements.chips.find((chip) => chip.classList.contains("active"));
  positionPillSlider({
    container: elements.presetNav,
    slider: elements.presetSlider,
    target: activeChip,
    animate
  });
}

function updateModeUi() {
  const shouldAnimateSlider = renderedMode !== null && renderedMode !== state.mode;
  Object.entries(elements.tabs).forEach(([mode, tab]) => {
    const active = mode === state.mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  positionModeSlider(shouldAnimateSlider);
  renderedMode = state.mode;

  const minutes = state.durations[state.mode];
  elements.timerLabel.textContent = MODE_LABELS[state.mode];
  elements.durationSlider.value = String(minutes);
  elements.durationReadout.textContent = `${minutes} 分`;
  const hasPreset = elements.chips.some((chip) => Number(chip.dataset.time) === minutes);
  const shouldAnimatePreset = renderedPresetTime !== null && renderedPresetTime !== minutes && hasPreset;
  elements.chips.forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.time) === minutes);
  });
  positionPresetSlider(shouldAnimatePreset);
  renderedPresetTime = hasPreset ? minutes : null;
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
  if (state.mode === "work") return state.workSessionsSinceLongBreak >= 4 ? "long" : "short";
  return "work";
}

function completeTimer(skipped = false) {
  pauseTimer();
  if (state.mode === "work") state.workSessionsSinceLongBreak += 1;
  if (state.mode === "long") state.workSessionsSinceLongBreak = 0;

  if (!skipped) {
    sound.alarm();
    if (state.mode === "work") {
      state.completedCount += 1;
      state.totalFocusMinutes += state.durations.work;
      updateStatsUi();
    }
  }

  const upcoming = nextMode();
  setMode(upcoming);
  if (state.autoStart && !skipped) window.setTimeout(startTimer, 1000);
}

function openSettings() {
  sound.click();
  if (mobileMedia.matches) {
    mobileView = "settings";
    updateMobileNavigation();
  }
  updateSettingsUi();
  elements.modal.hidden = false;
  requestAnimationFrame(() => {
    elements.modal.classList.add("open");
    refreshLiquidGlassLayout();
  });
  if (!mobileMedia.matches) elements.closeModalButton.focus({ preventScroll: true });
}

function closeSettings({ restoreFocus = true } = {}) {
  if (mobileView === "settings") {
    mobileView = lastMobileContentView;
    updateMobileNavigation();
  }
  elements.modal.classList.remove("open");
  window.setTimeout(() => {
    elements.modal.hidden = true;
    refreshLiquidGlassLayout();
    if (!restoreFocus) return;
    const focusTarget = mobileMedia.matches
      ? elements.mobileNavButtons.find((button) => button.dataset.mobileView === mobileView)
      : elements.settingsButton;
    focusTarget?.focus({ preventScroll: true });
  }, 220);
}

function selectMobileView(view) {
  if (view === "settings") {
    openSettings();
    return;
  }

  sound.click();
  mobileView = view;
  lastMobileContentView = view;
  updateMobileNavigation();
  if (!elements.modal.hidden) closeSettings({ restoreFocus: false });
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

  window.addEventListener("resize", () => {
    positionModeSlider(false);
    positionPresetSlider(false);
    refreshLiquidGlassLayout();
  }, { passive: true });

  elements.mobileNavButtons.forEach((button) => {
    button.addEventListener("click", () => selectMobileView(button.dataset.mobileView));
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
    if (event.target === elements.modal && !mobileMedia.matches) closeSettings();
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
    state.workSessionsSinceLongBreak = 0;
    state.totalFocusMinutes = 0;
    updateStatsUi();
    savePreferences();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncTimerToClock();
  });
}

function mountReturnedSvgAssets(result, owner) {
  const mountedAssets = [];

  Object.values(result ?? {}).forEach((value) => {
    if (value instanceof SVGElement) {
      value.setAttribute("data-liquid-glass-defs", "");
      value.dataset.liquidGlassOwner = owner;
      document.body.appendChild(value);
      mountedAssets.push(value);
      return;
    }
    if (typeof value !== "string" || !value.includes("<svg")) return;
    const template = document.createElement("template");
    template.innerHTML = value.trim();
    const svg = template.content.querySelector("svg");
    if (svg) {
      svg.setAttribute("data-liquid-glass-defs", "");
      svg.dataset.liquidGlassOwner = owner;
      document.body.appendChild(svg);
      mountedAssets.push(svg);
    }
  });

  return mountedAssets;
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
  const renderScale = 1;

  const glassTargets = [
    elements.soundButton,
    elements.themeButton,
    elements.settingsButton,
    elements.closeModalButton,
    elements.playButton,
    elements.resetButton,
    elements.skipButton,
    elements.timerOrbit,
    elements.modeNav,
    elements.presetNav,
    ...elements.statItems,
    elements.mobileNav
  ].filter(Boolean);
  const glassStates = new Map();
  let refreshTimer = null;
  let refreshFrame = null;

  function clearLiquidGlass(element) {
    const previous = glassStates.get(element);
    previous?.assets.forEach((asset) => asset.remove());
    glassStates.delete(element);
    element.style.removeProperty("backdrop-filter");
    element.style.removeProperty("-webkit-backdrop-filter");
  }

  function applyLiquidGlassTo(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const radiusValue = getComputedStyle(element).borderTopLeftRadius;
    const computedRadius = radiusValue.includes("%")
      ? Math.min(width, height) * Number.parseFloat(radiusValue) / 100
      : Number.parseFloat(radiusValue);
    const radius = Math.round(Math.min(
      Number.isFinite(computedRadius) ? computedRadius : 0,
      width / 2,
      height / 2
    ));
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

    const owner = element.id || [...element.classList].join("-") || "glass";
    const assets = mountReturnedSvgAssets(glass, owner);
    if (glass?.filterRef) {
      const filter = `${glass.filterRef} saturate(100%)`;
      element.style.backdropFilter = filter;
      element.style.webkitBackdropFilter = filter;
    }

    glassStates.set(element, { assets, width, height, radius });
  }

  function rebuildLiquidGlass() {
    refreshFrame = null;
    glassTargets.forEach(clearLiquidGlass);
    glassTargets.forEach(applyLiquidGlassTo);
  }

  refreshLiquidGlassLayout = () => {
    // Drop dimension-bound filters immediately so an old specular map can never
    // be stretched across the intermediate frames of an orientation change.
    glassTargets.forEach(clearLiquidGlass);
    window.clearTimeout(refreshTimer);
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refreshFrame = requestAnimationFrame(rebuildLiquidGlass);
    }, 140);
  };

  rebuildLiquidGlass();

  if ("ResizeObserver" in window) {
    const glassResizeObserver = new ResizeObserver(() => refreshLiquidGlassLayout());
    glassTargets.forEach((element) => glassResizeObserver.observe(element));
  }

  window.addEventListener("orientationchange", refreshLiquidGlassLayout, { passive: true });

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
  updateMobileNavigation();
  bindEvents();
  loadVisualEnhancements();
}

initialize();
