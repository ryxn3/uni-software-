/* Static catalog of "supported" devices (simulated detection — browsers
   cannot read vendor firmware state, so all live values are software-side
   profiles the same way real vendor apps store them before syncing). */

const POLLING_OPTIONS = [125, 500, 1000, 2000, 4000, 8000];
const POLLING_STD = [125, 500, 1000];

// Marketing-name RGB label per brand, used on the RGB panel & compat list.
const BRAND_RGB = {
  Razer: "Chroma RGB",
  Logitech: "Lightsync RGB",
  MCHOSE: "ARGB",
  Wooting: "RGB",
  SteelSeries: "Prism RGB",
  Corsair: "iCUE RGB",
  Glorious: "RGB",
  Pulsar: "RGB",
  Finalmouse: "RGB",
  ASUS: "Aura Sync RGB",
  Keychron: "RGB",
  Ducky: "RGB",
  "Royal Kludge": "RGB",
};

function mkMouse(id, brand, name, maxDpi, buttons, opts) {
  opts = opts || {};
  return {
    id, brand, name, maxDpi, buttons,
    polling: opts.polling || POLLING_OPTIONS,
    wireless: !!opts.wireless,
    socd: brand === "MCHOSE", // per driver policy, snap-tap is an MCHOSE-exclusive feature
    rgbName: BRAND_RGB[brand] || "RGB",
  };
}

function mkKeyboard(id, brand, name, opts) {
  opts = opts || {};
  return {
    id, brand, name,
    analog: !!opts.analog,
    rapidTrigger: !!opts.analog,
    socd: brand === "MCHOSE" && !!opts.analog, // SOCD/snap-tap: MCHOSE analog boards only
    rgb: opts.rgb !== false,
    rgbName: BRAND_RGB[brand] || "RGB",
    polling: opts.polling || POLLING_OPTIONS,
    actuationRange: opts.analog ? [0.1, 4.0] : undefined,
    layout: opts.layout || "tkl",
  };
}

const B6 = ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward"];
const B8 = ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward", "DPI+", "DPI-"];
const B5 = ["Left Click", "Right Click", "Scroll Click", "Back", "Forward"];

const DEVICE_CATALOG = {
  mice: [
    // ---- Razer: full Viper lineup ----
    mkMouse("razer-viper", "Razer", "Viper", 16000, B8, { wireless: false }),
    mkMouse("razer-viper-mini", "Razer", "Viper Mini", 8500, B6, { wireless: false }),
    mkMouse("razer-viper-mini-se", "Razer", "Viper Mini Signature Edition", 8500, B6, { wireless: true }),
    mkMouse("razer-viper-8khz", "Razer", "Viper 8KHz", 20000, B8, { wireless: false }),
    mkMouse("razer-viper-ultimate", "Razer", "Viper Ultimate", 20000, B8, { wireless: true }),
    mkMouse("razer-viper-v2-pro", "Razer", "Viper V2 Pro", 30000, B5, { wireless: true }),
    mkMouse("razer-viper-v3-pro", "Razer", "Viper V3 Pro", 35000, B5, { wireless: true }),
    mkMouse("razer-viper-v3-hyperspeed", "Razer", "Viper V3 HyperSpeed", 30000, B8, { wireless: true }),
    // ---- Razer: other lines ----
    mkMouse("razer-deathadder-v2", "Razer", "DeathAdder V2", 20000, B8, { wireless: false }),
    mkMouse("razer-deathadder-v3", "Razer", "DeathAdder V3", 30000, B6, { wireless: false }),
    mkMouse("razer-deathadder-v3-pro", "Razer", "DeathAdder V3 Pro", 30000, B6, { wireless: true }),
    mkMouse("razer-basilisk-v3-pro", "Razer", "Basilisk V3 Pro", 30000, B8, { wireless: true }),
    mkMouse("razer-naga-v2-pro", "Razer", "Naga V2 Pro", 30000, B8.concat(["Side Panel 1-12"]), { wireless: true }),

    // ---- Logitech ----
    mkMouse("logitech-g-pro-wireless", "Logitech", "G Pro Wireless", 25600, B6, { wireless: true }),
    mkMouse("logitech-gpro-x-superlight", "Logitech", "G Pro X Superlight", 25600, B5, { wireless: true }),
    mkMouse("logitech-gpro-x-superlight-2", "Logitech", "G Pro X Superlight 2", 32000, B5, { wireless: true }),
    mkMouse("logitech-g502-hero", "Logitech", "G502 Hero", 25600, B8.concat(["Gesture"]), { wireless: false }),
    mkMouse("logitech-g502x-plus", "Logitech", "G502 X Plus", 25600, B8.concat(["Gesture"]), { wireless: true }),
    mkMouse("logitech-g303-shroud", "Logitech", "G303 Shroud Edition", 25600, B6, { wireless: true }),
    mkMouse("logitech-g203-lightsync", "Logitech", "G203 Lightsync", 8000, B6, { wireless: false, polling: POLLING_STD }),

    // ---- MCHOSE ----
    mkMouse("mchose-a5-pro", "MCHOSE", "A5 Pro", 26000, B6, { wireless: true }),
    mkMouse("mchose-a5-air", "MCHOSE", "A5 Air", 26000, B6, { wireless: true }),
    mkMouse("mchose-g5-pro", "MCHOSE", "G5 Pro BT", 19000, B6, { wireless: true }),
    mkMouse("mchose-hs10", "MCHOSE", "HS10", 12800, B6, { wireless: false, polling: POLLING_STD }),

    // ---- SteelSeries ----
    mkMouse("steelseries-aerox-3-wireless", "SteelSeries", "Aerox 3 Wireless", 18000, B6, { wireless: true }),
    mkMouse("steelseries-aerox-5", "SteelSeries", "Aerox 5", 18000, B8.concat(["Thumb Panel"]), { wireless: true }),
    mkMouse("steelseries-rival-3", "SteelSeries", "Rival 3", 8500, B6, { wireless: false, polling: POLLING_STD }),

    // ---- Corsair ----
    mkMouse("corsair-sabre-rgb-pro", "Corsair", "Sabre RGB Pro", 26000, B6, { wireless: false }),
    mkMouse("corsair-dark-core-rgb-pro", "Corsair", "Dark Core RGB Pro", 18000, B8, { wireless: true }),

    // ---- Glorious ----
    mkMouse("glorious-model-o-wireless", "Glorious", "Model O Wireless", 19000, B6, { wireless: true }),
    mkMouse("glorious-model-d-2-pro", "Glorious", "Model D 2 Pro", 26000, B6, { wireless: true }),

    // ---- Pulsar ----
    mkMouse("pulsar-x2-v2", "Pulsar", "X2 V2", 26000, B6, { wireless: true }),

    // ---- Finalmouse ----
    mkMouse("finalmouse-starlight-12", "Finalmouse", "Starlight-12", 42000, B6, { wireless: true }),

    // ---- ASUS ROG ----
    mkMouse("asus-rog-harpe-ace", "ASUS", "ROG Harpe Ace Aim Lab Edition", 36000, B5, { wireless: true }),
    mkMouse("asus-rog-gladius-iii", "ASUS", "ROG Gladius III", 19000, B8, { wireless: false }),
  ],

  keyboards: [
    // ---- MCHOSE (magnetic/analog + SOCD) ----
    mkKeyboard("mchose-ace60", "MCHOSE", "ACE 60 HE (Magnetic)", { analog: true, layout: "ansi60" }),
    mkKeyboard("mchose-ace68", "MCHOSE", "ACE 68 HE", { analog: true, layout: "ansi60" }),
    mkKeyboard("mchose-gx87", "MCHOSE", "GX87 Magnetic", { analog: true, layout: "tkl" }),
    mkKeyboard("mchose-x87", "MCHOSE", "X87", { analog: false, layout: "tkl" }),

    // ---- Razer ----
    mkKeyboard("razer-huntsman-v3-pro-tkl", "Razer", "Huntsman V3 Pro TKL", { analog: true, layout: "tkl" }),
    mkKeyboard("razer-huntsman-v3-pro", "Razer", "Huntsman V3 Pro", { analog: true, layout: "full" }),
    mkKeyboard("razer-huntsman-mini", "Razer", "Huntsman Mini", { analog: false, layout: "ansi60" }),
    mkKeyboard("razer-blackwidow-v4", "Razer", "BlackWidow V4", { analog: false, layout: "full" }),
    mkKeyboard("razer-blackwidow-v4-75", "Razer", "BlackWidow V4 75%", { analog: false, layout: "tkl" }),
    mkKeyboard("razer-deathstalker-v2-pro", "Razer", "DeathStalker V2 Pro", { analog: false, layout: "full" }),

    // ---- Logitech ----
    mkKeyboard("logitech-g915x", "Logitech", "G915 X TKL", { analog: false, layout: "tkl" }),
    mkKeyboard("logitech-pro-x60", "Logitech", "PRO X 60", { analog: false, layout: "ansi60" }),
    mkKeyboard("logitech-g915-tkl", "Logitech", "G915 TKL", { analog: false, layout: "tkl" }),
    mkKeyboard("logitech-g-pro-x-tkl", "Logitech", "G Pro X TKL", { analog: false, layout: "tkl" }),
    mkKeyboard("logitech-g913", "Logitech", "G913", { analog: false, layout: "full" }),

    // ---- Wooting (analog / rapid trigger pioneers) ----
    mkKeyboard("wooting-60he", "Wooting", "60HE", { analog: true, layout: "ansi60" }),
    mkKeyboard("wooting-60he-plus", "Wooting", "60HE+", { analog: true, layout: "ansi60" }),
    mkKeyboard("wooting-80he", "Wooting", "80HE", { analog: true, layout: "tkl" }),
    mkKeyboard("wooting-two-he", "Wooting", "Two HE", { analog: true, layout: "full" }),

    // ---- SteelSeries ----
    mkKeyboard("steelseries-apex-pro", "SteelSeries", "Apex Pro", { analog: true, layout: "full" }),
    mkKeyboard("steelseries-apex-pro-tkl", "SteelSeries", "Apex Pro TKL", { analog: true, layout: "tkl" }),
    mkKeyboard("steelseries-apex-pro-mini", "SteelSeries", "Apex Pro Mini", { analog: true, layout: "ansi60" }),

    // ---- Corsair ----
    mkKeyboard("corsair-k70-max", "Corsair", "K70 Max", { analog: true, layout: "full" }),
    mkKeyboard("corsair-k65-plus-wireless", "Corsair", "K65 Plus Wireless", { analog: true, layout: "tkl" }),

    // ---- Keychron ----
    mkKeyboard("keychron-q1-he", "Keychron", "Q1 HE", { analog: true, layout: "full" }),
    mkKeyboard("keychron-k8-pro", "Keychron", "K8 Pro", { analog: false, layout: "tkl" }),

    // ---- Ducky ----
    mkKeyboard("ducky-one-3", "Ducky", "One 3", { analog: false, layout: "tkl" }),

    // ---- Royal Kludge ----
    mkKeyboard("royal-kludge-rk84", "Royal Kludge", "RK84", { analog: false, layout: "tkl" }),
  ],
};

const BUTTON_FUNCTIONS = [
  "Default",
  "Disabled",
  "DPI Cycle Up",
  "DPI Cycle Down",
  "Sniper (Hold Lowest DPI)",
  "Profile Cycle",
  "Custom Keystroke",
  "Macro",
];

const RGB_EFFECTS = ["Off", "Static", "Breathing", "Wave", "Reactive", "Spectrum Cycle"];

const SWATCHES = [
  "#39ff6a", "#ff4d4d", "#ffb000", "#3df0ff", "#c86bff",
  "#ffffff", "#ff2e88", "#00ffa3", "#7cff2e", "#2e7bff",
];

/* Keyboard layouts as rows of [code, label, width(units of 34px key + gap)] */
const LAYOUTS = {
  ansi60: [
    [["Backquote","`",1],["Digit1","1",1],["Digit2","2",1],["Digit3","3",1],["Digit4","4",1],["Digit5","5",1],["Digit6","6",1],["Digit7","7",1],["Digit8","8",1],["Digit9","9",1],["Digit0","0",1],["Minus","-",1],["Equal","=",1],["Backspace","Bksp",2]],
    [["Tab","Tab",1.5],["KeyQ","Q",1],["KeyW","W",1],["KeyE","E",1],["KeyR","R",1],["KeyT","T",1],["KeyY","Y",1],["KeyU","U",1],["KeyI","I",1],["KeyO","O",1],["KeyP","P",1],["BracketLeft","[",1],["BracketRight","]",1],["Backslash","\\",1.5]],
    [["CapsLock","Caps",1.75],["KeyA","A",1],["KeyS","S",1],["KeyD","D",1],["KeyF","F",1],["KeyG","G",1],["KeyH","H",1],["KeyJ","J",1],["KeyK","K",1],["KeyL","L",1],["Semicolon",";",1],["Quote","'",1],["Enter","Enter",2.25]],
    [["ShiftLeft","Shift",2.25],["KeyZ","Z",1],["KeyX","X",1],["KeyC","C",1],["KeyV","V",1],["KeyB","B",1],["KeyN","N",1],["KeyM","M",1],["Comma",",",1],["Period",".",1],["Slash","/",1],["ShiftRight","Shift",2.75]],
    [["ControlLeft","Ctrl",1.25],["MetaLeft","Win",1.25],["AltLeft","Alt",1.25],["Space","Space",6.25],["AltRight","Alt",1.25],["ControlRight","Fn",1.25],["ArrowLeft","<",1]],
  ],
  tkl: [
    [["Escape","Esc",1],["_g1",null,1],["F1","F1",1],["F2","F2",1],["F3","F3",1],["F4","F4",1],["_g2",null,.5],["F5","F5",1],["F6","F6",1],["F7","F7",1],["F8","F8",1],["_g3",null,.5],["F9","F9",1],["F10","F10",1],["F11","F11",1],["F12","F12",1]],
    [["Backquote","`",1],["Digit1","1",1],["Digit2","2",1],["Digit3","3",1],["Digit4","4",1],["Digit5","5",1],["Digit6","6",1],["Digit7","7",1],["Digit8","8",1],["Digit9","9",1],["Digit0","0",1],["Minus","-",1],["Equal","=",1],["Backspace","Bksp",2]],
    [["Tab","Tab",1.5],["KeyQ","Q",1],["KeyW","W",1],["KeyE","E",1],["KeyR","R",1],["KeyT","T",1],["KeyY","Y",1],["KeyU","U",1],["KeyI","I",1],["KeyO","O",1],["KeyP","P",1],["BracketLeft","[",1],["BracketRight","]",1],["Backslash","\\",1.5]],
    [["CapsLock","Caps",1.75],["KeyA","A",1],["KeyS","S",1],["KeyD","D",1],["KeyF","F",1],["KeyG","G",1],["KeyH","H",1],["KeyJ","J",1],["KeyK","K",1],["KeyL","L",1],["Semicolon",";",1],["Quote","'",1],["Enter","Enter",2.25]],
    [["ShiftLeft","Shift",2.25],["KeyZ","Z",1],["KeyX","X",1],["KeyC","C",1],["KeyV","V",1],["KeyB","B",1],["KeyN","N",1],["KeyM","M",1],["Comma",",",1],["Period",".",1],["Slash","/",1],["ShiftRight","Shift",2.75]],
    [["ControlLeft","Ctrl",1.25],["MetaLeft","Win",1.25],["AltLeft","Alt",1.25],["Space","Space",6.25],["AltRight","Alt",1.25],["ControlRight","Ctrl",1.25],["ArrowLeft","<",1],["ArrowUp","^",1],["ArrowDown","v",1]],
  ],
  full: [
    [["Escape","Esc",1],["F1","F1",1],["F2","F2",1],["F3","F3",1],["F4","F4",1],["F5","F5",1],["F6","F6",1],["F7","F7",1],["F8","F8",1],["F9","F9",1],["F10","F10",1],["F11","F11",1],["F12","F12",1]],
    [["Backquote","`",1],["Digit1","1",1],["Digit2","2",1],["Digit3","3",1],["Digit4","4",1],["Digit5","5",1],["Digit6","6",1],["Digit7","7",1],["Digit8","8",1],["Digit9","9",1],["Digit0","0",1],["Minus","-",1],["Equal","=",1],["Backspace","Bksp",2]],
    [["Tab","Tab",1.5],["KeyQ","Q",1],["KeyW","W",1],["KeyE","E",1],["KeyR","R",1],["KeyT","T",1],["KeyY","Y",1],["KeyU","U",1],["KeyI","I",1],["KeyO","O",1],["KeyP","P",1],["BracketLeft","[",1],["BracketRight","]",1],["Backslash","\\",1.5]],
    [["CapsLock","Caps",1.75],["KeyA","A",1],["KeyS","S",1],["KeyD","D",1],["KeyF","F",1],["KeyG","G",1],["KeyH","H",1],["KeyJ","J",1],["KeyK","K",1],["KeyL","L",1],["Semicolon",";",1],["Quote","'",1],["Enter","Enter",2.25]],
    [["ShiftLeft","Shift",2.25],["KeyZ","Z",1],["KeyX","X",1],["KeyC","C",1],["KeyV","V",1],["KeyB","B",1],["KeyN","N",1],["KeyM","M",1],["Comma",",",1],["Period",".",1],["Slash","/",1],["ShiftRight","Shift",2.75]],
    [["ControlLeft","Ctrl",1.25],["MetaLeft","Win",1.25],["AltLeft","Alt",1.25],["Space","Space",6.25],["AltRight","Alt",1.25],["ControlRight","Ctrl",1.25],["ArrowLeft","<",1],["ArrowUp","^",1],["ArrowDown","v",1]],
  ],
};

/* Best-effort USB vendor ID -> brand name, used to label a real WebHID
   scan result. Not exhaustive — many OEM controllers (including most
   budget/whitelabel boards) don't map to a recognizable brand, in which
   case the scan just labels the device "Generic". */
const VENDOR_MAP = {
  0x1532: "Razer",
  0x046d: "Logitech",
  0x1038: "SteelSeries",
  0x1b1c: "Corsair",
  0x0b05: "ASUS",
  0x093a: "Glorious",
  0x03eb: "Wooting",
  0x3434: "Keychron",
  0x04d9: "Ducky",
  0x258a: "MCHOSE",
};

function mkGenericMouse(vendorId, productId, productName) {
  return mkMouse(
    `hid-mouse-${vendorId}-${productId}`,
    VENDOR_MAP[vendorId] || "Generic",
    productName || "HID Mouse",
    16000,
    B6,
    { wireless: false }
  );
}

function mkGenericKeyboard(vendorId, productId, productName) {
  return mkKeyboard(
    `hid-kbd-${vendorId}-${productId}`,
    VENDOR_MAP[vendorId] || "Generic",
    productName || "HID Keyboard",
    { analog: false, layout: "tkl" }
  );
}

// Try to line up a real scanned HID device with a known catalog entry
// (same brand, and name substrings overlap), so a recognized Razer/
// Logitech/MCHOSE device gets its full simulated feature set instead of
// generic defaults. Returns null if nothing matches well.
function findCatalogMatch(kind, brand, productName) {
  const list = kind === "mouse" ? DEVICE_CATALOG.mice : DEVICE_CATALOG.keyboards;
  const pool = list.filter((d) => d.brand === brand);
  if (!pool.length) return null;
  const name = (productName || "").toLowerCase();
  const byName = pool.find((d) => name && (name.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(name)));
  return byName || pool[0];
}

const SOCD_DEFAULT_PAIRS = [
  { id: "ad", label: "A / D  (Horizontal)", a: "KeyA", b: "KeyD" },
  { id: "ws", label: "W / S  (Vertical)", a: "KeyW", b: "KeyS" },
  { id: "arrow-lr", label: "Left / Right Arrow", a: "ArrowLeft", b: "ArrowRight" },
];
