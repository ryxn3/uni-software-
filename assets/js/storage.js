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
        activeMouse: DEVICE_CATALOG.mice[0].id,
        activeKeyboard: DEVICE_CATALOG.keyboards[0].id,
        mouseProfiles: {},
        keyboardProfiles: {},
        macros: [],
        theme: "white",
        crtFx: false,
      };
    }
    // backfill any missing device profiles
    DEVICE_CATALOG.mice.forEach((d) => {
      if (!this.data.mouseProfiles[d.id]) this.data.mouseProfiles[d.id] = defaultMouseProfile(d);
    });
    DEVICE_CATALOG.keyboards.forEach((d) => {
      if (!this.data.keyboardProfiles[d.id]) this.data.keyboardProfiles[d.id] = defaultKeyboardProfile(d);
    });
    if (!this.data.macros) this.data.macros = [];
    return this.data;
  },

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage may be unavailable (private mode) — fail silently */
    }
  },

  mouse() {
    return DEVICE_CATALOG.mice.find((d) => d.id === this.data.activeMouse);
  },
  mouseProfile() {
    return this.data.mouseProfiles[this.data.activeMouse];
  },
  keyboard() {
    return DEVICE_CATALOG.keyboards.find((d) => d.id === this.data.activeKeyboard);
  },
  keyboardProfile() {
    return this.data.keyboardProfiles[this.data.activeKeyboard];
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
