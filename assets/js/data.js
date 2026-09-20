/* Static catalog of "supported" devices (simulated detection — browsers
   cannot read vendor firmware state, so all live values are software-side
   profiles the same way real vendor apps store them before syncing). */

const POLLING_OPTIONS = [125, 500, 1000, 2000, 4000, 8000];

const DEVICE_CATALOG = {
  mice: [
    {
      id: "razer-deathadder-v3-pro",
      brand: "Razer",
      name: "DeathAdder V3 Pro",
      maxDpi: 30000,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: false,
      rgbName: "Chroma RGB",
    },
    {
      id: "razer-viper-v3-pro",
      brand: "Razer",
      name: "Viper V3 Pro",
      maxDpi: 35000,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: false,
      rgbName: "Chroma RGB",
    },
    {
      id: "logitech-gpro-x-superlight-2",
      brand: "Logitech",
      name: "G Pro X Superlight 2",
      maxDpi: 32000,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI", "Back", "Forward"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: false,
      rgbName: "Lightsync RGB",
    },
    {
      id: "logitech-g502x-plus",
      brand: "Logitech",
      name: "G502 X Plus",
      maxDpi: 25600,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI+", "DPI-", "Back", "Forward", "Gesture"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: false,
      rgbName: "Lightsync RGB",
    },
    {
      id: "mchose-a5-pro",
      brand: "MCHOSE",
      name: "A5 Pro",
      maxDpi: 26000,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: true,
      rgbName: "ARGB",
    },
    {
      id: "mchose-g5-pro",
      brand: "MCHOSE",
      name: "G5 Pro BT",
      maxDpi: 19000,
      buttons: ["Left Click", "Right Click", "Scroll Click", "DPI Cycle", "Back", "Forward"],
      polling: POLLING_OPTIONS,
      wireless: true,
      socd: true,
      rgbName: "ARGB",
    },
  ],

  keyboards: [
    {
      id: "mchose-ace60",
      brand: "MCHOSE",
      name: "ACE 60 HE (Magnetic)",
      analog: true,
      rapidTrigger: true,
      socd: true,
      rgb: true,
      rgbName: "ARGB",
      polling: POLLING_OPTIONS,
      actuationRange: [0.1, 4.0],
      layout: "ansi60",
    },
    {
      id: "mchose-gx87",
      brand: "MCHOSE",
      name: "GX87 Magnetic",
      analog: true,
      rapidTrigger: true,
      socd: true,
      rgb: true,
      rgbName: "ARGB",
      polling: POLLING_OPTIONS,
      actuationRange: [0.1, 4.0],
      layout: "tkl",
    },
    {
      id: "razer-huntsman-v3-pro",
      brand: "Razer",
      name: "Huntsman V3 Pro TKL",
      analog: true,
      rapidTrigger: true,
      socd: false,
      rgb: true,
      rgbName: "Chroma RGB",
      polling: POLLING_OPTIONS,
      actuationRange: [0.1, 4.0],
      layout: "tkl",
    },
    {
      id: "razer-blackwidow-v4",
      brand: "Razer",
      name: "BlackWidow V4",
      analog: false,
      rapidTrigger: false,
      socd: false,
      rgb: true,
      rgbName: "Chroma RGB",
      polling: POLLING_OPTIONS,
      layout: "full",
    },
    {
      id: "logitech-g915x",
      brand: "Logitech",
      name: "G915 X TKL",
      analog: false,
      rapidTrigger: false,
      socd: false,
      rgb: true,
      rgbName: "Lightsync RGB",
      polling: POLLING_OPTIONS,
      layout: "tkl",
    },
    {
      id: "logitech-pro-x60",
      brand: "Logitech",
      name: "PRO X 60",
      analog: false,
      rapidTrigger: false,
      socd: false,
      rgb: true,
      rgbName: "Lightsync RGB",
      polling: POLLING_OPTIONS,
      layout: "ansi60",
    },
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

const SOCD_DEFAULT_PAIRS = [
  { id: "ad", label: "A / D  (Horizontal)", a: "KeyA", b: "KeyD" },
  { id: "ws", label: "W / S  (Vertical)", a: "KeyW", b: "KeyS" },
  { id: "arrow-lr", label: "Left / Right Arrow", a: "ArrowLeft", b: "ArrowRight" },
];
