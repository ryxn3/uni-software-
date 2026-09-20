/* DEVTERM — all-text terminal console for peripheral configuration.
   Vanilla JS, no build step. See data.js for the device catalog and
   storage.js for the persisted profile model. */

(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  State.load();
  const state = State; // state.data === State.data (kept as `state` for brevity below)

  /* ---------------------------------------------------------------- */
  /* BOOT SEQUENCE                                                     */
  /* ---------------------------------------------------------------- */

  const BOOT_LINES = [
    "DEVTERM BIOS v1.4.2 ................ OK",
    "Enumerating USB controllers ........ OK",
    "Polling HID class devices .......... OK",
    "Loading vendor driver shims:",
    "  razer_hid.sys ..................... OK",
    "  logitech_hidpp.sys ................ OK",
    "  mchose_hid.sys .................... OK",
    "Mounting local profile store ....... OK",
    "Restoring last session profiles .... OK",
    "",
    "DEVTERM READY.",
  ];

  function boot() {
    const el = $("#boot-screen");
    let i = 0;
    let buf = "";
    el.textContent = "";
    const cursor = () => '<span id="boot-cursor">█</span>';

    function typeLine() {
      if (i >= BOOT_LINES.length) {
        el.innerHTML = buf + cursor();
        setTimeout(finishBoot, 350);
        return;
      }
      buf += BOOT_LINES[i] + "\n";
      el.innerHTML = buf + cursor();
      i++;
      setTimeout(typeLine, BOOT_LINES[i - 1] === "" ? 60 : 90 + Math.random() * 70);
    }
    typeLine();
  }

  function finishBoot() {
    $("#boot-screen").classList.add("hidden");
    $("#terminal").classList.remove("hidden");
    initApp();
  }

  /* ---------------------------------------------------------------- */
  /* APP INIT                                                          */
  /* ---------------------------------------------------------------- */

  function initApp() {
    applyTheme();
    initNav();
    renderDevicesScreen();
    renderMouseScreen();
    renderKeyboardScreen();
    renderMacrosScreen();
    renderProfilesScreen();
    initCommandLine();
    updateStatusBar();
    initWebHID();
  }

  function applyTheme() {
    const theme = state.data.theme || "white";
    if (theme === "white") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    $("#crt").classList.toggle("flicker", !!state.data.crtFx);
    const sel = $("#theme-select");
    if (sel) sel.value = theme;
    const fx = $("#crtfx-toggle");
    if (fx) setBadge(fx, state.data.crtFx);
  }

  function updateStatusBar() {
    $("#status-text").textContent = "2 DEVICES LINKED";
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function setBadge(btn, on, onText, offText) {
    btn.textContent = on ? (onText || "ON") : (offText || "OFF");
    btn.classList.toggle("on", !!on);
  }

  /* ---------------------------------------------------------------- */
  /* NAV / SCREENS                                                     */
  /* ---------------------------------------------------------------- */

  function initNav() {
    $$("#nav button").forEach((btn) => {
      btn.addEventListener("click", () => showScreen(btn.dataset.screen));
    });
  }

  function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $$("#nav button").forEach((b) => b.classList.remove("active"));
    const target = $("#screen-" + name);
    const btn = $(`#nav button[data-screen="${name}"]`);
    if (!target || !btn) return;
    target.classList.add("active");
    btn.classList.add("active");
    if (name === "profiles") refreshRawState();
  }

  /* ---------------------------------------------------------------- */
  /* DEVICES SCREEN                                                    */
  /* ---------------------------------------------------------------- */

  function renderDevicesScreen() {
    const miceWrap = $("#mice-cards");
    miceWrap.innerHTML = "";
    DEVICE_CATALOG.mice.forEach((d) => {
      const card = document.createElement("div");
      card.className = "device-card" + (d.id === state.data.activeMouse ? " selected" : "");
      card.innerHTML = `
        <div class="brand">${d.brand}</div>
        <div class="name">${d.name}</div>
        <div class="meta">MAX ${d.maxDpi.toLocaleString()} DPI · ${d.buttons.length} BTN · up to ${d.polling[d.polling.length - 1]}Hz</div>
        <div class="meta">${d.id === state.data.activeMouse ? "[ACTIVE]" : "click to select"}</div>`;
      card.addEventListener("click", () => {
        state.data.activeMouse = d.id;
        State.save();
        renderDevicesScreen();
        renderMouseScreen();
        toast(`Active mouse set to ${d.brand} ${d.name}`);
      });
      miceWrap.appendChild(card);
    });

    const kbdWrap = $("#kbd-cards");
    kbdWrap.innerHTML = "";
    DEVICE_CATALOG.keyboards.forEach((d) => {
      const card = document.createElement("div");
      card.className = "device-card" + (d.id === state.data.activeKeyboard ? " selected" : "");
      card.innerHTML = `
        <div class="brand">${d.brand}</div>
        <div class="name">${d.name}</div>
        <div class="meta">${d.analog ? "MAGNETIC / ANALOG" : "MECHANICAL"} ${d.rapidTrigger ? "· RAPID TRIGGER" : ""}</div>
        <div class="meta">${d.socd ? "SOCD CAPABLE · " : ""}up to ${d.polling[d.polling.length - 1]}Hz</div>
        <div class="meta">${d.id === state.data.activeKeyboard ? "[ACTIVE]" : "click to select"}</div>`;
      card.addEventListener("click", () => {
        state.data.activeKeyboard = d.id;
        State.save();
        renderDevicesScreen();
        renderKeyboardScreen();
        toast(`Active keyboard set to ${d.brand} ${d.name}`);
      });
      kbdWrap.appendChild(card);
    });
  }

  function initWebHID() {
    const supportEl = $("#webhid-support");
    const supported = "hid" in navigator;
    supportEl.textContent = supported ? "WebHID API: available" : "WebHID API: not supported in this browser";
    $("#btn-webhid-scan").addEventListener("click", async () => {
      const resultEl = $("#webhid-result");
      resultEl.style.display = "block";
      if (!supported) {
        resultEl.textContent = "ERROR: navigator.hid is unavailable. Use a Chromium-based browser over HTTPS.";
        return;
      }
      try {
        resultEl.textContent = "Requesting device permission...";
        const devices = await navigator.hid.requestDevice({ filters: [] });
        if (!devices.length) {
          resultEl.textContent = "No device selected.";
          return;
        }
        resultEl.textContent = devices
          .map(
            (d) =>
              `DEVICE: ${d.productName || "Unknown"}\n  vendorId=0x${d.vendorId.toString(16).padStart(4, "0")} productId=0x${d.productId.toString(16).padStart(4, "0")}\n  collections=${d.collections.length}`
          )
          .join("\n\n");
      } catch (err) {
        resultEl.textContent = "Scan cancelled or blocked: " + err.message;
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* MOUSE SCREEN                                                       */
  /* ---------------------------------------------------------------- */

  function renderMouseScreen() {
    const dev = State.mouse();
    const prof = State.mouseProfile();
    $("#mouse-active-name").textContent = `— ${dev.brand} ${dev.name}`;

    // DPI stages
    const stagesEl = $("#dpi-stages");
    stagesEl.innerHTML = "";
    prof.dpiStages.forEach((dpi, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <label>Stage ${idx + 1} ${idx === prof.activeStage ? '<span class="badge on">ACTIVE</span>' : ""}</label>
        <input type="range" min="100" max="${dev.maxDpi}" step="50" value="${dpi}" data-idx="${idx}" class="dpi-range" style="flex:1;">
        <span class="val dpi-val">${dpi}</span>
        <button class="dpi-select" data-idx="${idx}" title="Set as active stage">USE</button>`;
      stagesEl.appendChild(row);
    });
    $$(".dpi-range", stagesEl).forEach((r) =>
      r.addEventListener("input", (e) => {
        const idx = +e.target.dataset.idx;
        prof.dpiStages[idx] = +e.target.value;
        e.target.parentElement.querySelector(".dpi-val").textContent = e.target.value;
        State.save();
      })
    );
    $$(".dpi-select", stagesEl).forEach((b) =>
      b.addEventListener("click", (e) => {
        prof.activeStage = +e.target.dataset.idx;
        State.save();
        renderMouseScreen();
      })
    );

    $("#dpi-add").disabled = prof.dpiStages.length >= 5;
    $("#dpi-remove").disabled = prof.dpiStages.length <= 1;

    // polling
    const pollSel = $("#mouse-polling");
    pollSel.innerHTML = dev.polling.map((hz) => `<option value="${hz}">${hz} Hz (${(1000 / hz).toFixed(2)}ms)</option>`).join("");
    pollSel.value = prof.polling;
    $("#mouse-polling-note").textContent =
      prof.polling >= 4000
        ? "Ultra-high polling — expect increased CPU/USB bus usage."
        : "Higher Hz lowers click latency at the cost of USB bandwidth.";

    $("#mouse-lod").value = prof.liftOffDistance;
    $("#lod-val").textContent = prof.liftOffDistance + " mm";

    // button map
    const tbody = $("#button-map-table tbody");
    tbody.innerHTML = "";
    dev.buttons.forEach((btn) => {
      const fn = prof.buttonMap[btn] || "Default";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${btn}</td>
        <td>
          <select class="fn-select" data-btn="${btn}">
            ${BUTTON_FUNCTIONS.map((f) => `<option value="${f}" ${f === fn ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </td>
        <td class="extra-cell"></td>`;
      tbody.appendChild(tr);
      renderButtonExtra(tr.querySelector(".extra-cell"), btn, fn, prof);
    });
    $$(".fn-select", tbody).forEach((sel) =>
      sel.addEventListener("change", (e) => {
        const btn = e.target.dataset.btn;
        prof.buttonMap[btn] = e.target.value;
        State.save();
        renderButtonExtra(e.target.closest("tr").querySelector(".extra-cell"), btn, e.target.value, prof);
      })
    );

    setBadge($("#mouse-socd-toggle"), prof.socdEnabled);

    $("#mouse-polling").onchange = (e) => {
      prof.polling = +e.target.value;
      State.save();
      renderMouseScreen();
    };
    $("#mouse-lod").oninput = (e) => {
      prof.liftOffDistance = +e.target.value;
      $("#lod-val").textContent = e.target.value + " mm";
      State.save();
    };
    $("#dpi-add").onclick = () => {
      if (prof.dpiStages.length >= 5) return;
      const last = prof.dpiStages[prof.dpiStages.length - 1] || 800;
      prof.dpiStages.push(Math.min(dev.maxDpi, last + 800));
      State.save();
      renderMouseScreen();
    };
    $("#dpi-remove").onclick = () => {
      if (prof.dpiStages.length <= 1) return;
      prof.dpiStages.pop();
      if (prof.activeStage >= prof.dpiStages.length) prof.activeStage = prof.dpiStages.length - 1;
      State.save();
      renderMouseScreen();
    };
    $("#mouse-socd-toggle").onclick = () => {
      prof.socdEnabled = !prof.socdEnabled;
      State.save();
      setBadge($("#mouse-socd-toggle"), prof.socdEnabled);
    };
  }

  function renderButtonExtra(cell, btn, fn, prof) {
    cell.innerHTML = "";
    if (fn === "Custom Keystroke") {
      const input = document.createElement("input");
      input.placeholder = "e.g. Ctrl+C";
      input.value = prof.buttonMacro[btn] || "";
      input.addEventListener("input", (e) => {
        prof.buttonMacro[btn] = e.target.value;
        State.save();
      });
      cell.appendChild(input);
    } else if (fn === "Macro") {
      const select = document.createElement("select");
      const macros = state.data.macros;
      select.innerHTML =
        `<option value="">— choose macro —</option>` +
        macros.map((m) => `<option value="${m.id}" ${prof.buttonMacro[btn] === m.id ? "selected" : ""}>${m.name}</option>`).join("");
      select.addEventListener("change", (e) => {
        prof.buttonMacro[btn] = e.target.value;
        State.save();
      });
      cell.appendChild(select);
      if (!macros.length) {
        const hint = document.createElement("div");
        hint.className = "small dim";
        hint.textContent = "no macros recorded yet";
        cell.appendChild(hint);
      }
    } else {
      cell.innerHTML = '<span class="dim small">—</span>';
    }
  }

  /* ---------------------------------------------------------------- */
  /* KEYBOARD SCREEN                                                    */
  /* ---------------------------------------------------------------- */

  let selectedKeyCode = null;
  let keyTestEnabled = false;
  const keyPressState = {}; // code -> {downAt}

  function renderKeyboardScreen() {
    const dev = State.keyboard();
    const prof = State.keyboardProfile();
    $("#kbd-active-name").textContent = `— ${dev.brand} ${dev.name}`;

    const pollSel = $("#kbd-polling");
    pollSel.innerHTML = dev.polling.map((hz) => `<option value="${hz}">${hz} Hz (${(1000 / hz).toFixed(2)}ms)</option>`).join("");
    pollSel.value = prof.polling;
    pollSel.onchange = (e) => {
      prof.polling = +e.target.value;
      State.save();
    };

    $("#panel-actuation").style.display = dev.analog ? "" : "none";
    $("#panel-keytest").style.display = "";
    $("#panel-socd").style.display = dev.socd ? "" : "none";
    $("#panel-rgb").style.display = dev.rgb ? "" : "none";

    $("#analog-note").textContent = dev.analog
      ? "Magnetic/Hall-effect switches — per-key actuation point and Rapid Trigger available."
      : "";
    $("#rgb-note").textContent = dev.rgb ? `${dev.brand} ${dev.name} — per-zone lighting control.` : "";

    if (dev.analog) {
      renderKeyLayout(dev, prof);
      selectKey(selectedKeyCode || firstKeyCode(dev), dev, prof);
      setBadge($("#rt-toggle"), prof.rapidTrigger);
      $("#rt-sens").value = prof.rtSensitivity;
      $("#rt-sens-val").textContent = prof.rtSensitivity.toFixed(2) + " mm";
      $("#rt-init").value = prof.rtInitialTravel;
      $("#rt-init-val").textContent = prof.rtInitialTravel.toFixed(2) + " mm";
    }

    if (dev.socd) renderSocdPanel(dev, prof);
    if (dev.rgb) renderRgbPanel(dev, prof);

    setBadge($("#keytest-toggle"), keyTestEnabled, "TEST MODE ON", "ENABLE TEST MODE");
    $("#keytest-status").textContent = keyTestEnabled ? "ENABLED" : "DISABLED";
    $("#keytest-status").classList.toggle("on", keyTestEnabled);
  }

  function firstKeyCode(dev) {
    const rows = LAYOUTS[dev.layout];
    for (const row of rows) for (const [code] of row) if (code) return code;
    return null;
  }

  function renderKeyLayout(dev, prof) {
    const wrap = $("#kb-layout");
    wrap.innerHTML = "";
    const rows = LAYOUTS[dev.layout] || LAYOUTS.tkl;
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      row.forEach(([code, label, width]) => {
        const keyEl = document.createElement("div");
        keyEl.style.flexBasis = 34 * width + 4 * (width - 1) + "px";
        if (!code || label === null) {
          keyEl.style.visibility = "hidden";
          rowEl.appendChild(keyEl);
          return;
        }
        keyEl.className = "key";
        keyEl.dataset.code = code;
        const ap = prof.actuation[code];
        keyEl.innerHTML = `${label}${ap ? `<span class="ap">${ap.toFixed(1)}</span>` : ""}`;
        keyEl.addEventListener("click", () => selectKey(code, dev, prof));
        rowEl.appendChild(keyEl);
      });
      wrap.appendChild(rowEl);
    });
  }

  function selectKey(code, dev, prof) {
    selectedKeyCode = code;
    $$(".key", $("#kb-layout")).forEach((k) => k.classList.toggle("selected", k.dataset.code === code));
    $("#sel-key").textContent = code || "—";
    const val = prof.actuation[code] != null ? prof.actuation[code] : prof.globalActuation;
    $("#ap-slider").value = val;
    $("#ap-val").textContent = val.toFixed(2) + " mm";
  }

  function bindKeyboardStaticHandlers() {
    $("#ap-slider").addEventListener("input", (e) => {
      const dev = State.keyboard();
      const prof = State.keyboardProfile();
      if (!selectedKeyCode) return;
      const v = +e.target.value;
      prof.actuation[selectedKeyCode] = v;
      $("#ap-val").textContent = v.toFixed(2) + " mm";
      State.save();
      renderKeyLayout(dev, prof);
      selectKey(selectedKeyCode, dev, prof);
    });
    $("#ap-apply-all").addEventListener("click", () => {
      const dev = State.keyboard();
      const prof = State.keyboardProfile();
      const v = +$("#ap-slider").value;
      const rows = LAYOUTS[dev.layout];
      rows.forEach((row) => row.forEach(([code]) => { if (code) prof.actuation[code] = v; }));
      prof.globalActuation = v;
      State.save();
      renderKeyLayout(dev, prof);
      selectKey(selectedKeyCode, dev, prof);
      toast("Actuation point applied to all keys");
    });
    $("#ap-reset").addEventListener("click", () => {
      const dev = State.keyboard();
      const prof = State.keyboardProfile();
      if (!selectedKeyCode) return;
      delete prof.actuation[selectedKeyCode];
      State.save();
      renderKeyLayout(dev, prof);
      selectKey(selectedKeyCode, dev, prof);
    });

    $("#rt-toggle").addEventListener("click", () => {
      const prof = State.keyboardProfile();
      prof.rapidTrigger = !prof.rapidTrigger;
      State.save();
      setBadge($("#rt-toggle"), prof.rapidTrigger);
    });
    $("#rt-sens").addEventListener("input", (e) => {
      const prof = State.keyboardProfile();
      prof.rtSensitivity = +e.target.value;
      $("#rt-sens-val").textContent = prof.rtSensitivity.toFixed(2) + " mm";
      State.save();
    });
    $("#rt-init").addEventListener("input", (e) => {
      const prof = State.keyboardProfile();
      prof.rtInitialTravel = +e.target.value;
      $("#rt-init-val").textContent = prof.rtInitialTravel.toFixed(2) + " mm";
      State.save();
    });

    // key test mode
    $("#keytest-toggle").addEventListener("click", () => {
      keyTestEnabled = !keyTestEnabled;
      setBadge($("#keytest-toggle"), keyTestEnabled, "TEST MODE ON", "ENABLE TEST MODE");
      $("#keytest-status").textContent = keyTestEnabled ? "ENABLED" : "DISABLED";
      $("#keytest-status").classList.toggle("on", keyTestEnabled);
      if (keyTestEnabled) $("#keytest-zone").focus();
    });

    const zone = $("#keytest-zone");
    zone.addEventListener("keydown", (e) => {
      if (!keyTestEnabled) return;
      e.preventDefault();
      if (keyPressState[e.code]) return; // ignore OS auto-repeat
      keyPressState[e.code] = performance.now();
      highlightKey(e.code, true);
      animateTravel(e.code);
      $("#keytest-readout").innerHTML = `<span class="badge on">DOWN</span> ${e.code}`;
    });
    zone.addEventListener("keyup", (e) => {
      if (!keyTestEnabled) return;
      e.preventDefault();
      const downAt = keyPressState[e.code];
      const dur = downAt ? (performance.now() - downAt).toFixed(1) : "?";
      delete keyPressState[e.code];
      highlightKey(e.code, false);
      $("#keytest-travel").style.width = "0%";
      $("#keytest-readout").innerHTML = `<span class="badge">UP</span> ${e.code} — held ${dur} ms`;
    });

    // SOCD
    $("#socd-toggle").addEventListener("click", () => {
      const prof = State.keyboardProfile();
      prof.socdEnabled = !prof.socdEnabled;
      State.save();
      setBadge($("#socd-toggle"), prof.socdEnabled);
    });
    $("#socd-mode").addEventListener("change", (e) => {
      const prof = State.keyboardProfile();
      prof.socdMode = e.target.value;
      State.save();
    });

    const socdZone = $("#socd-demo-zone");
    const socdPressOrder = [];
    socdZone.addEventListener("keydown", (e) => {
      if (!socdPressOrder.includes(e.code)) socdPressOrder.push(e.code);
      updateSocdDemo(socdPressOrder);
    });
    socdZone.addEventListener("keyup", (e) => {
      const i = socdPressOrder.indexOf(e.code);
      if (i >= 0) socdPressOrder.splice(i, 1);
      updateSocdDemo(socdPressOrder);
    });

    // RGB
    $("#rgb-effect").addEventListener("change", (e) => {
      const prof = State.keyboardProfile();
      prof.rgb.effect = e.target.value;
      State.save();
    });
    $("#rgb-brightness").addEventListener("input", (e) => {
      const prof = State.keyboardProfile();
      prof.rgb.brightness = +e.target.value;
      $("#rgb-brightness-val").textContent = e.target.value + "%";
      State.save();
    });
    $("#rgb-speed").addEventListener("input", (e) => {
      const prof = State.keyboardProfile();
      prof.rgb.speed = +e.target.value;
      $("#rgb-speed-val").textContent = e.target.value + "%";
      State.save();
    });
  }

  function highlightKey(code, on) {
    const el = $(`.key[data-code="${code}"]`, $("#kb-layout"));
    if (el) el.classList.toggle("active-press", on);
  }

  function animateTravel(code) {
    const prof = State.keyboardProfile();
    const ap = prof.actuation[code] != null ? prof.actuation[code] : prof.globalActuation;
    const durationMs = 40 + ap * 60; // smaller actuation point = faster perceived trigger
    const bar = $("#keytest-travel");
    bar.style.transition = "none";
    bar.style.width = "0%";
    requestAnimationFrame(() => {
      bar.style.transition = `width ${durationMs}ms linear`;
      bar.style.width = "100%";
    });
  }

  function renderSocdPanel(dev, prof) {
    setBadge($("#socd-toggle"), prof.socdEnabled);
    $("#socd-mode").value = prof.socdMode;
    const wrap = $("#socd-pairs");
    wrap.innerHTML = "";
    prof.socdPairs.forEach((pair) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <label>${pair.label}</label>
        <button class="badge ${pair.enabled ? "on" : ""}" data-pair="${pair.id}">${pair.enabled ? "ENABLED" : "DISABLED"}</button>`;
      row.querySelector("button").addEventListener("click", (e) => {
        pair.enabled = !pair.enabled;
        State.save();
        renderSocdPanel(dev, prof);
      });
      wrap.appendChild(row);
    });
    renderSocdDemoZone(prof);
  }

  function renderSocdDemoZone(prof) {
    const demo = $("#socd-demo");
    demo.innerHTML = "";
    prof.socdPairs
      .filter((p) => p.enabled)
      .forEach((pair) => {
        const row = document.createElement("div");
        row.className = "pair-demo mt";
        row.dataset.pairId = pair.id;
        row.innerHTML = `
          <div class="side" data-side="a">${pair.a.replace("Key", "").replace("Arrow", "")}</div>
          <span class="dim">vs</span>
          <div class="side" data-side="b">${pair.b.replace("Key", "").replace("Arrow", "")}</div>
          <span class="dim small">${pair.label}</span>`;
        demo.appendChild(row);
      });
  }

  function updateSocdDemo(pressOrder) {
    const prof = State.keyboardProfile();
    const mode = prof.socdMode;
    prof.socdPairs.forEach((pair) => {
      const row = $(`.pair-demo[data-pair-id="${pair.id}"]`);
      if (!row) return;
      const aDown = pressOrder.includes(pair.a);
      const bDown = pressOrder.includes(pair.b);
      const sideA = row.querySelector('[data-side="a"]');
      const sideB = row.querySelector('[data-side="b"]');
      sideA.classList.remove("win");
      sideB.classList.remove("win");
      if (aDown && !bDown) sideA.classList.add("win");
      else if (bDown && !aDown) sideB.classList.add("win");
      else if (aDown && bDown) {
        if (mode === "neutral" || mode === "neutral-permanent") {
          // neither wins
        } else if (mode === "first-input") {
          const aIdx = pressOrder.indexOf(pair.a);
          const bIdx = pressOrder.indexOf(pair.b);
          if (aIdx < bIdx) sideA.classList.add("win");
          else sideB.classList.add("win");
        } else {
          // last-input priority (snap tap): whichever appears later in press order wins
          const aIdx = pressOrder.indexOf(pair.a);
          const bIdx = pressOrder.indexOf(pair.b);
          if (aIdx > bIdx) sideA.classList.add("win");
          else sideB.classList.add("win");
        }
      }
    });
  }

  function renderRgbPanel(dev, prof) {
    const effSel = $("#rgb-effect");
    effSel.innerHTML = RGB_EFFECTS.map((f) => `<option value="${f}" ${f === prof.rgb.effect ? "selected" : ""}>${f}</option>`).join("");

    const swWrap = $("#rgb-swatches");
    swWrap.innerHTML = "";
    SWATCHES.forEach((hex) => {
      const sw = document.createElement("div");
      sw.className = "swatch" + (prof.rgb.color === hex ? " selected" : "");
      sw.style.background = hex;
      sw.title = hex;
      sw.addEventListener("click", () => {
        prof.rgb.color = hex;
        State.save();
        renderRgbPanel(dev, prof);
      });
      swWrap.appendChild(sw);
    });

    $("#rgb-brightness").value = prof.rgb.brightness;
    $("#rgb-brightness-val").textContent = prof.rgb.brightness + "%";
    $("#rgb-speed").value = prof.rgb.speed;
    $("#rgb-speed-val").textContent = prof.rgb.speed + "%";

    const zoneWrap = $("#rgb-zones");
    zoneWrap.innerHTML = "";
    prof.rgb.zones.forEach((on, i) => {
      const z = document.createElement("div");
      z.className = "zone" + (on ? " on" : "");
      z.addEventListener("click", () => {
        prof.rgb.zones[i] = !prof.rgb.zones[i];
        State.save();
        renderRgbPanel(dev, prof);
      });
      zoneWrap.appendChild(z);
    });
  }

  /* ---------------------------------------------------------------- */
  /* MACROS SCREEN                                                      */
  /* ---------------------------------------------------------------- */

  let recording = false;
  let recordBuf = [];
  let recordStart = 0;

  function renderMacrosScreen() {
    const list = $("#macro-list");
    list.innerHTML = "";
    const macros = state.data.macros;
    $("#macro-empty").style.display = macros.length ? "none" : "";
    macros.forEach((m) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span><b>${m.name}</b> <span class="dim small">(${m.steps.length} events, ${m.duration}ms)</span></span>
        <span class="actions" style="margin:0;">
          <button class="macro-play" data-id="${m.id}">PLAY LOG</button>
          <button class="macro-del" data-id="${m.id}">DELETE</button>
        </span>`;
      list.appendChild(li);
    });
    $$(".macro-play", list).forEach((b) => b.addEventListener("click", () => playMacro(b.dataset.id)));
    $$(".macro-del", list).forEach((b) =>
      b.addEventListener("click", () => {
        state.data.macros = state.data.macros.filter((m) => m.id !== b.dataset.id);
        State.save();
        renderMacrosScreen();
      })
    );
  }

  function macroLog(text, cls) {
    const log = $("#macro-log");
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function bindMacroHandlers() {
    $("#macro-record").addEventListener("click", () => {
      recording = true;
      recordBuf = [];
      recordStart = performance.now();
      $("#macro-record").disabled = true;
      $("#macro-stop").disabled = false;
      setBadgeText($("#macro-rec-status"), "RECORDING");
      $("#macro-capture-zone").focus();
      macroLog("-- recording started --", "l-sys");
    });

    $("#macro-stop").addEventListener("click", () => {
      recording = false;
      $("#macro-record").disabled = false;
      $("#macro-stop").disabled = true;
      setBadgeText($("#macro-rec-status"), "IDLE");
      if (!recordBuf.length) {
        macroLog("-- nothing captured --", "l-sys");
        return;
      }
      const name = prompt("Name this macro:", "macro_" + (state.data.macros.length + 1));
      if (!name) {
        macroLog("-- discarded (no name given) --", "l-sys");
        return;
      }
      const duration = Math.round(recordBuf[recordBuf.length - 1].t);
      state.data.macros.push({ id: "m_" + Date.now(), name, steps: recordBuf.slice(), duration });
      State.save();
      renderMacrosScreen();
      macroLog(`-- saved as "${name}" --`, "l-sys");
    });

    $("#macro-clear").addEventListener("click", () => {
      $("#macro-log").innerHTML = "";
    });

    const zone = $("#macro-capture-zone");
    zone.addEventListener("keydown", (e) => {
      if (!recording) return;
      e.preventDefault();
      if (e.repeat) return;
      const t = performance.now() - recordStart;
      recordBuf.push({ type: "down", code: e.code, key: e.key, t });
      macroLog(`+${t.toFixed(0)}ms  KEYDOWN  ${e.code}`, "l-down");
    });
    zone.addEventListener("keyup", (e) => {
      if (!recording) return;
      e.preventDefault();
      const t = performance.now() - recordStart;
      recordBuf.push({ type: "up", code: e.code, key: e.key, t });
      macroLog(`+${t.toFixed(0)}ms  KEYUP    ${e.code}`, "l-up");
    });
  }

  function setBadgeText(el, text) {
    el.textContent = text;
    el.classList.toggle("on", text !== "IDLE");
  }

  function playMacro(id) {
    const m = state.data.macros.find((x) => x.id === id);
    if (!m) return;
    macroLog(`-- replaying "${m.name}" --`, "l-sys");
    m.steps.forEach((step) => {
      setTimeout(() => {
        macroLog(`+${step.t.toFixed(0)}ms  ${step.type === "down" ? "KEYDOWN " : "KEYUP   "} ${step.code}`, step.type === "down" ? "l-down" : "l-up");
      }, step.t);
    });
  }

  /* ---------------------------------------------------------------- */
  /* PROFILES SCREEN                                                    */
  /* ---------------------------------------------------------------- */

  function renderProfilesScreen() {
    refreshRawState();
    $("#btn-export").addEventListener("click", () => {
      const blob = new Blob([State.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "devterm-profile.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Profile exported");
    });

    $("#btn-import-trigger").addEventListener("click", () => $("#btn-import-file").click());
    $("#btn-import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          State.importJSON(reader.result);
          toast("Profile imported");
          initApp();
          showScreen("profiles");
        } catch (err) {
          toast("Import failed: invalid JSON");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    $("#btn-reset").addEventListener("click", () => {
      if (!confirm("Erase all local profiles and restore factory defaults?")) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    });

    $("#theme-select").addEventListener("change", (e) => {
      state.data.theme = e.target.value;
      State.save();
      applyTheme();
    });
    $("#crtfx-toggle").addEventListener("click", () => {
      state.data.crtFx = !state.data.crtFx;
      State.save();
      applyTheme();
    });
  }

  function refreshRawState() {
    const el = $("#raw-state");
    if (el) el.textContent = State.exportJSON();
  }

  /* ---------------------------------------------------------------- */
  /* COMMAND LINE                                                       */
  /* ---------------------------------------------------------------- */

  function initCommandLine() {
    const input = $("#cmd-input");
    const log = $("#cmd-log");
    const history = [];
    let histIdx = -1;

    function echo(text, cls) {
      const line = document.createElement("div");
      if (cls) line.className = cls;
      line.textContent = text;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    function run(cmdline) {
      echo("$ " + cmdline, "echo");
      const [cmd, ...args] = cmdline.trim().split(/\s+/);
      switch ((cmd || "").toLowerCase()) {
        case "":
          break;
        case "help":
          echo("commands: help, devices, mouse, keyboard, macros, profiles, about, scan, use <mouse|kbd> <id>, dpi <hz-index>, poll <hz>, theme <white|green|amber|cyan>, crtfx <on|off>, export, clear", "ok");
          break;
        case "devices": case "ls":
          showScreen("devices"); echo("switched to DEVICES", "ok"); break;
        case "mouse":
          showScreen("mouse"); echo("switched to MOUSE", "ok"); break;
        case "keyboard": case "kbd":
          showScreen("keyboard"); echo("switched to KEYBOARD", "ok"); break;
        case "macros":
          showScreen("macros"); echo("switched to MACROS", "ok"); break;
        case "profiles":
          showScreen("profiles"); echo("switched to PROFILES", "ok"); break;
        case "about":
          showScreen("about"); break;
        case "scan":
          echo("scanning bus... found " + (DEVICE_CATALOG.mice.length + DEVICE_CATALOG.keyboards.length) + " known-driver devices", "ok");
          showScreen("devices");
          break;
        case "use": {
          const [kind, id] = args;
          if (kind === "mouse" && DEVICE_CATALOG.mice.some((d) => d.id === id)) {
            state.data.activeMouse = id; State.save(); renderDevicesScreen(); renderMouseScreen();
            echo("active mouse -> " + id, "ok");
          } else if ((kind === "kbd" || kind === "keyboard") && DEVICE_CATALOG.keyboards.some((d) => d.id === id)) {
            state.data.activeKeyboard = id; State.save(); renderDevicesScreen(); renderKeyboardScreen();
            echo("active keyboard -> " + id, "ok");
          } else {
            echo("usage: use <mouse|kbd> <device-id>  (see 'devices')", "err");
          }
          break;
        }
        case "poll": {
          const hz = +args[0];
          const scr = $(".screen.active").id;
          if (!hz) { echo("usage: poll <hz>", "err"); break; }
          if (scr === "screen-keyboard") { State.keyboardProfile().polling = hz; State.save(); renderKeyboardScreen(); }
          else { State.mouseProfile().polling = hz; State.save(); renderMouseScreen(); }
          echo("polling rate -> " + hz + "Hz", "ok");
          break;
        }
        case "theme":
          if (["white", "green", "amber", "cyan"].includes(args[0])) {
            state.data.theme = args[0]; State.save(); applyTheme();
            echo("theme -> " + args[0], "ok");
          } else echo("usage: theme <white|green|amber|cyan>", "err");
          break;
        case "crtfx":
          state.data.crtFx = args[0] === "on"; State.save(); applyTheme();
          echo("crt fx -> " + (state.data.crtFx ? "on" : "off"), "ok");
          break;
        case "export":
          $("#btn-export") && $("#btn-export").click();
          break;
        case "clear":
          log.innerHTML = "";
          break;
        case "whoami":
          echo("guest (local browser session)", "ok");
          break;
        default:
          echo(`command not found: ${cmd}  (try 'help')`, "err");
      }
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = input.value;
        if (val.trim()) { history.push(val); histIdx = history.length; }
        run(val);
        input.value = "";
      } else if (e.key === "ArrowUp") {
        if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
        else { histIdx = history.length; input.value = ""; }
        e.preventDefault();
      }
    });

    echo("DEVTERM shell ready. Type 'help' for commands.", "ok");
  }

  bindKeyboardStaticHandlers();
  bindMacroHandlers();
  boot();
})();
