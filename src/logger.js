'use strict';

/**
 * Thin logging facade.
 *
 * Inside WinCC OA we want messages to land in the manager log via the
 * `WinccoaManager` logging helpers (logInfo/logWarning/logSevere). Outside of
 * WinCC OA (unit tests, local tooling) we fall back to the console so the code
 * stays runnable everywhere.
 *
 * The facade also accepts printf-style varargs, matching the WinCC OA logging
 * API, and renders them with util.format for the console fallback.
 */

const util = require('util');

class Logger {
  /**
   * @param {object} [winccoa] a WinccoaManager instance (optional)
   * @param {string} [prefix] short tag prepended to console messages
   * @param {boolean} [debug] enable debug-level output
   */
  constructor(winccoa = null, prefix = '[ZebraLabel]', debug = false) {
    this._winccoa = winccoa;
    this._prefix = prefix;
    this._debug = Boolean(debug);
  }

  /** @param {object} winccoa */
  attachWinccoa(winccoa) {
    this._winccoa = winccoa;
  }

  /** @param {boolean} enabled */
  setDebug(enabled) {
    this._debug = Boolean(enabled);
  }

  /** @returns {boolean} */
  get debugEnabled() {
    return this._debug;
  }

  info(message, ...args) {
    if (this._winccoa && typeof this._winccoa.logInfo === 'function') {
      this._winccoa.logInfo(message, ...args);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${this._prefix} ${util.format(message, ...args)}`);
    }
  }

  /**
   * Debug-level message. Suppressed unless debug mode is enabled. Routed to the
   * WinCC OA debug log (logDebugF) when available, otherwise to the console.
   */
  debug(message, ...args) {
    if (!this._debug) return;
    if (this._winccoa && typeof this._winccoa.logDebugF === 'function') {
      this._winccoa.logDebugF(message, ...args);
    } else if (this._winccoa && typeof this._winccoa.logInfo === 'function') {
      // Fallback: emit as info so it still reaches the WinCC OA log.
      this._winccoa.logInfo(`DEBUG ${message}`, ...args);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${this._prefix} DEBUG ${util.format(message, ...args)}`);
    }
  }

  warning(message, ...args) {
    if (this._winccoa && typeof this._winccoa.logWarning === 'function') {
      this._winccoa.logWarning(message, ...args);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`${this._prefix} WARN ${util.format(message, ...args)}`);
    }
  }

  severe(message, ...args) {
    if (this._winccoa && typeof this._winccoa.logSevere === 'function') {
      this._winccoa.logSevere(message, ...args);
    } else {
      // eslint-disable-next-line no-console
      console.error(`${this._prefix} ERROR ${util.format(message, ...args)}`);
    }
  }
}

module.exports = { Logger };
