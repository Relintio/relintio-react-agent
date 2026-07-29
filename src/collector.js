/**
 * Relintio visitor telemetry collector, v2.
 *
 * One implementation, three surfaces: the Shopify storefront agent, the React
 * provider, and the challenge page. They have to agree, because a visitor who
 * passes the challenge and then loads a protected page must present the same
 * device identity both times — otherwise the pass they just earned belongs to
 * a device that never comes back.
 *
 * The contract this implements is contracts/telemetry-v2.md. Read that first;
 * the rules about absent-versus-empty and about never blocking the page are
 * load-bearing, not style notes.
 *
 * No dependencies, no build step, ES5-compatible so it can be inlined into a
 * ScriptTag as-is.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RelintioCollector = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Fixed and ordered. A different list produces a different digest, which
   * produces a different device — so this must never diverge between surfaces
   * or drift over time without a deliberate decision to re-identify everyone.
   */
  var FONT_PROBE_LIST = [
    'Arial', 'Arial Black', 'Bookman Old Style', 'Calibri', 'Cambria', 'Candara',
    'Comic Sans MS', 'Consolas', 'Courier New', 'DejaVu Sans', 'Franklin Gothic Medium',
    'Garamond', 'Georgia', 'Helvetica Neue', 'Impact', 'Liberation Sans',
    'Lucida Console', 'Lucida Grande', 'Menlo', 'Monaco', 'Palatino Linotype',
    'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Verdana', 'Webdings'
  ];

  /**
   * Every probe goes through here.
   *
   * A collector that can throw is a collector that can break a customer's
   * checkout, and a broken checkout costs more than any bot ever will. On a
   * throw the family is omitted rather than sent empty, because empty means
   * "looked and found nothing" and that carries weight server-side.
   */
  function attempt(fn) {
    try {
      var value = fn();
      return value === undefined ? null : value;
    } catch (e) {
      return null;
    }
  }

  /** FNV-1a, 32-bit, rendered as 8 hex chars, folded over four passes. */
  function digest(input) {
    var text = String(input);
    var out = '';

    for (var pass = 0; pass < 4; pass++) {
      var h = 2166136261 ^ (pass * 0x9e3779b1);
      for (var i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      out += ('0000000' + h.toString(16)).slice(-8);
    }

    return out;
  }

  // ── families ──────────────────────────────────────────────────────────────

  function hardware() {
    var nav = navigator;
    var out = {};

    if (typeof screen !== 'undefined') {
      out.screen = (screen.width || 0) + 'x' + (screen.height || 0);
      if (typeof screen.colorDepth === 'number') out.depth = screen.colorDepth;
    }
    if (typeof window.devicePixelRatio === 'number') out.dpr = window.devicePixelRatio;
    if (nav.platform) out.platform = nav.platform;
    if (typeof nav.hardwareConcurrency === 'number') out.cores = nav.hardwareConcurrency;
    if (typeof nav.deviceMemory === 'number') out.memory = nav.deviceMemory;

    return out;
  }

  /**
   * Width comparison: render a fixed string in the candidate face backed by a
   * generic fallback, and again in the fallback alone. A difference means the
   * candidate resolved. Measured through canvas rather than DOM nodes so
   * nothing is inserted into the customer's page.
   */
  function fonts() {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var sample = 'mmmmmmmmmmlli18WQ';
    var baselines = {};
    var generics = ['monospace', 'sans-serif', 'serif'];

    for (var g = 0; g < generics.length; g++) {
      ctx.font = '72px ' + generics[g];
      baselines[generics[g]] = ctx.measureText(sample).width;
    }

    var found = [];
    for (var i = 0; i < FONT_PROBE_LIST.length; i++) {
      for (var j = 0; j < generics.length; j++) {
        ctx.font = '72px "' + FONT_PROBE_LIST[i] + '",' + generics[j];
        if (ctx.measureText(sample).width !== baselines[generics[j]]) {
          found.push(FONT_PROBE_LIST[i]);
          break;
        }
      }
    }

    // Deliberately returns [] when nothing resolved. That is a finding, not a
    // failure: a desktop with no fonts is a container.
    return found;
  }

  function plugins() {
    if (!navigator.plugins) return null;

    var names = [];
    for (var i = 0; i < navigator.plugins.length; i++) {
      var name = navigator.plugins[i] && navigator.plugins[i].name;
      if (name) names.push(String(name));
    }

    return names;
  }

  function canvasHash() {
    var canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fixed scene. Anti-aliasing, subpixel rounding and the text rasteriser
    // differ per GPU and per font stack, so the same drawing produces
    // different pixels on different machines and identical pixels on the same.
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Relintio', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('Relintio', 4, 17);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.arc(50, 50, 40, 0, Math.PI * 2, true);
    ctx.fill();

    return digest(canvas.toDataURL());
  }

  function gpuRenderer() {
    var gl = document.createElement('canvas').getContext('webgl')
      || document.createElement('canvas').getContext('experimental-webgl');
    if (!gl) return null;

    var info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) return null;

    return gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || null;
  }

  /**
   * Offline render, not a live context: 44 frames of an oscillator through a
   * compressor, summed. Deterministic per audio stack, silent, and finished
   * before it could be heard even if it were audible.
   *
   * Asynchronous, so it resolves separately from the rest of the collection
   * and is folded in only if it lands within the budget.
   */
  function audioHash() {
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.resolve(null);

    return new Promise(function (resolve) {
      try {
        var context = new Offline(1, 44100, 44100);
        var oscillator = context.createOscillator();
        var compressor = context.createDynamicsCompressor();

        oscillator.type = 'triangle';
        oscillator.frequency.value = 10000;
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);
        context.startRendering();

        context.oncomplete = function (event) {
          try {
            var samples = event.renderedBuffer.getChannelData(0);
            var sum = 0;
            for (var i = 4500; i < 5000; i++) sum += Math.abs(samples[i]);
            resolve(digest(sum.toString()));
          } catch (e) {
            resolve(null);
          }
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  function network() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return null;

    var out = {};
    if (conn.effectiveType) out.effective_type = String(conn.effectiveType);
    if (typeof conn.rtt === 'number') out.rtt = conn.rtt;
    if (typeof conn.downlink === 'number') out.downlink = conn.downlink;
    if (typeof conn.saveData === 'boolean') out.save_data = conn.saveData;

    return out;
  }

  function environment() {
    var out = {};

    if (typeof window.outerWidth === 'number') out.outerW = window.outerWidth;
    if (typeof window.outerHeight === 'number') out.outerH = window.outerHeight;
    if (typeof navigator.maxTouchPoints === 'number') out.touch_points = navigator.maxTouchPoints;
    if (typeof navigator.cookieEnabled === 'boolean') out.cookies_enabled = navigator.cookieEnabled;
    out.webdriver = navigator.webdriver === true;

    return out;
  }

  // ── behaviour ─────────────────────────────────────────────────────────────

  /**
   * Counters, never content.
   *
   * This never learns what was typed, where the pointer went, or what was
   * scrolled to — only how many times each happened. A verdict does not need
   * more than that, and anything more would be a keylogger sitting on someone
   * else's checkout page.
   *
   * Listeners are passive so they cannot delay a scroll, and the whole thing
   * detaches on the first call to snapshot().
   */
  function watchBehaviour() {
    var started = Date.now();
    var counts = { pointer: 0, keys: 0, scrolls: 0, touches: 0 };
    var bound = [];

    function bind(type, key) {
      var handler = function () { counts[key]++; };
      try {
        window.addEventListener(type, handler, { passive: true, capture: true });
        bound.push([type, handler]);
      } catch (e) {
        // Older browsers reject the options object; a missed family is fine.
      }
    }

    bind('pointermove', 'pointer');
    bind('mousemove', 'pointer');
    bind('keydown', 'keys');
    bind('scroll', 'scrolls');
    bind('touchstart', 'touches');

    return {
      snapshot: function () {
        for (var i = 0; i < bound.length; i++) {
          try { window.removeEventListener(bound[i][0], bound[i][1], true); } catch (e) {}
        }
        bound = [];

        return {
          dwell_ms: Date.now() - started,
          pointer: counts.pointer,
          keys: counts.keys,
          scrolls: counts.scrolls,
          touches: counts.touches
        };
      }
    };
  }

  // ── collection ────────────────────────────────────────────────────────────

  /** Drop nulls so an omitted family is absent rather than reported empty. */
  function compact(object) {
    var out = {};
    for (var key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key) && object[key] !== null) {
        out[key] = object[key];
      }
    }
    return out;
  }

  function collectSync(behaviour) {
    var nav = navigator;

    var telemetry = compact({
      user_agent: nav.userAgent || null,
      timezone: attempt(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }),
      languages: attempt(function () {
        if (nav.languages && nav.languages.length) return Array.prototype.slice.call(nav.languages);
        return nav.language ? [nav.language] : null;
      }),
      fonts: attempt(fonts),
      plugins: attempt(plugins),
      canvas_hash: attempt(canvasHash),
      gpu_renderer: attempt(gpuRenderer),
      network: attempt(network),
      behaviour: behaviour ? attempt(behaviour.snapshot) : null
    });

    telemetry.hardware = attempt(hardware) || {};

    return { telemetry: telemetry, env: attempt(environment) || {} };
  }

  /**
   * Collect everything. Resolves with `{ telemetry, env }`.
   *
   * Audio is the only asynchronous family. It is raced against a budget rather
   * than awaited, so a browser whose audio stack hangs costs the visitor a
   * missing family and not a delayed page.
   */
  function collect(options) {
    var budgetMs = (options && options.audioBudgetMs) || 120;
    var behaviour = options && options.behaviour;
    var payload = collectSync(behaviour);

    var audio = attempt(audioHash) || Promise.resolve(null);
    var budget = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, budgetMs); });

    return Promise.race([audio, budget]).then(function (hash) {
      // Reported-and-null, not omitted: the family was attempted, and a
      // browser that claims to be Chrome while producing no audio is worth a
      // small nudge. Omitting it would say nothing at all.
      if (window.OfflineAudioContext || window.webkitOfflineAudioContext) {
        payload.telemetry.audio_hash = hash;
      }

      return payload;
    }).catch(function () {
      return payload;
    });
  }

  return {
    collect: collect,
    collectSync: collectSync,
    watchBehaviour: watchBehaviour,
    digest: digest,
    FONT_PROBE_LIST: FONT_PROBE_LIST
  };
}));
