/* Central persisted state — localStorage, mirrors what a real vendor
   daemon would keep as an on-disk device profile. */

const STORE_KEY = "devterm_state_v2";

function defaultMouseProfile(dev) {
  const buttonMap = {};
  dev.buttons.forEach((b, i) => {
    buttonMap[b] = i === 0 ? "Default" : i === 1 ? "Default" : "Default";
  });
  return {
    dpiStages: [400, 800, 1600, 3200, 6400].filter((v) => v <= dev.maxDpi),
    activeStage: 1,
    polling: dev.polling.includes(1000) ? 1000 : dev.polling[0],
    liftOffDistance: 2,
    buttonMap,
    buttonMacro: {},
    socdEnabled: false,
  };
}

function defaultKeyboardProfile(dev) {
  return {
    polling: dev.polling.includes(1000) ? 1000 : dev.polling[0],
    actuation: {}, // code -> mm
    globalActuation: 2.0,
    rapidTrigger: false,
    rtSensitivity: 0.2,
    rtInitialTravel: 0.3,
    socdEnabled: false,
    socdMode: "last-input", // last-input | neutral | first-input | neutral-permanent
    socdPairs: SOCD_DEFAULT_PAIRS.map((p) => ({ ...p, enabled: true })),
    rgb: {
      effect: "Static",
      color: "#39ff6a",
      brightness: 80,
      speed: 50,
      zones: new Array(24).fill(true),
    },
  };
}

const State = {
  data: null,

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (e) {
      raw = null;
    }
    if (raw) {
      try {
        this.data = JSON.parse(raw);
      } catch (e) {
        this.data = null;
      }
    }
    if (!this.data) {
      this.data = {
        activeMouse: null,
        activeKeyboard: null,
        mouseProfiles: {},
        keyboardProfiles: {},
        detected: [], // devices found by the last WebHID scan, for re-display
        macros: [],
        theme: "white",
        crtFx: false,
      };
    }
    if (!this.data.macros) this.data.macros = [];
    if (!this.data.detected) this.data.detected = [];
    return this.data;
  },

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage may be unavailable (private mode) — fail silently */
    }
  },

  // Runtime registry of devices — the static catalog plus any generic
  // devices synthesized from a real WebHID scan (see app.js scanDevices()).
  registry: { mice: [], keyboards: [] },
  initRegistry() {
    this.registry.mice = DEVICE_CATALOG.mice.slice();
    this.registry.keyboards = DEVICE_CATALOG.keyboards.slice();
  },
  addToRegistry(kind, dev) {
    const list = kind === "mouse" ? this.registry.mice : this.registry.keyboards;
    if (!list.some((d) => d.id === dev.id)) list.push(dev);
  },

  ensureMouseProfile(dev) {
    if (!this.data.mouseProfiles[dev.id]) this.data.mouseProfiles[dev.id] = defaultMouseProfile(dev);
    return this.data.mouseProfiles[dev.id];
  },
  ensureKeyboardProfile(dev) {
    if (!this.data.keyboardProfiles[dev.id]) this.data.keyboardProfiles[dev.id] = defaultKeyboardProfile(dev);
    return this.data.keyboardProfiles[dev.id];
  },

  mouse() {
    if (!this.data.activeMouse) return null;
    return this.registry.mice.find((d) => d.id === this.data.activeMouse) || null;
  },
  mouseProfile() {
    const dev = this.mouse();
    return dev ? this.ensureMouseProfile(dev) : null;
  },
  keyboard() {
    if (!this.data.activeKeyboard) return null;
    return this.registry.keyboards.find((d) => d.id === this.data.activeKeyboard) || null;
  },
  keyboardProfile() {
    const dev = this.keyboard();
    return dev ? this.ensureKeyboardProfile(dev) : null;
  },

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  },
  importJSON(str) {
    const parsed = JSON.parse(str);
    this.data = parsed;
    this.save();
  },
};
