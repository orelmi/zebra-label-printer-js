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
   */
  constructor(winccoa = null, prefix = '[ZebraLabel]') {
    this._winccoa = winccoa;
    this._prefix = prefix;
  }

  /** @param {object} winccoa */
  attachWinccoa(winccoa) {
    this._winccoa = winccoa;
  }

  info(message, ...args) {
    if (this._winccoa && typeof this._winccoa.logInfo === 'function') {
      this._winccoa.logInfo(message, ...args);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${this._prefix} ${util.format(message, ...args)}`);
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
