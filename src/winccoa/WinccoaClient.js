'use strict';

/**
 * Wrapper around the official `winccoa-manager` package.
 *
 * It isolates every direct dependency on WinCC OA behind a small, easily
 * mockable surface (dpGet / dpSet / dpExists / connect / disconnect). The real
 * `winccoa-manager` module is lazy-required so this file can be imported on a
 * host where WinCC OA is not installed (e.g. CI) as long as a manager instance
 * is injected for tests.
 *
 * `winccoa-manager` is NOT published on the public npm registry. Install it from
 * the WinCC OA installation directory, for example:
 *   npm install file:/opt/WinCC_OA/3.21/javascript/winccoa-manager
 */

/**
 * @typedef {import('../logger').Logger} Logger
 */

class WinccoaClient {
  /**
   * @param {object} [options]
   * @param {object} [options.manager] pre-built WinccoaManager (for tests/DI)
   * @param {Logger}  [options.logger]
   */
  constructor({ manager, logger } = {}) {
    this._manager = manager || WinccoaClient._createManager();
    this._logger = logger || null;
    /** @type {Set<number>} active dpConnect ids */
    this._connections = new Set();
  }

  /** @returns {object} the underlying WinccoaManager instance */
  get manager() {
    return this._manager;
  }

  /**
   * Lazily require and instantiate the real WinccoaManager.
   * @returns {object}
   */
  static _createManager() {
    let WinccoaManager;
    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      ({ WinccoaManager } = require('winccoa-manager'));
    } catch (err) {
      throw new Error(
        'The "winccoa-manager" package could not be loaded. It ships with the ' +
          'WinCC OA installation and must be installed from the local path, e.g. ' +
          '`npm install file:/opt/WinCC_OA/3.21/javascript/winccoa-manager`. ' +
          `Original error: ${err.message}`,
      );
    }
    return new WinccoaManager();
  }

  /**
   * @param {string} dpe
   * @returns {boolean}
   */
  dpExists(dpe) {
    return this._manager.dpExists(dpe);
  }

  /**
   * Reads one or more DPEs.
   * @param {string|string[]} dpes
   * @returns {Promise<unknown[]|unknown>} array when given an array
   */
  async dpGet(dpes) {
    return this._manager.dpGet(dpes);
  }

  /**
   * Writes one or more DPEs (fire-and-forget, synchronous in WinCC OA).
   * @param {string|string[]} dpes
   * @param {unknown} values
   * @returns {boolean}
   */
  dpSet(dpes, values) {
    return this._manager.dpSet(dpes, values);
  }

  /**
   * Subscribes to DPE value changes.
   * @param {string[]} dpes
   * @param {(names: string[], values: unknown[], type: unknown, error?: unknown) => void} callback
   * @param {boolean} [answer=true] deliver the current values immediately
   * @returns {number} connection id (use with disconnect)
   */
  connect(dpes, callback, answer = true) {
    const id = this._manager.dpConnect(callback, dpes, answer);
    this._connections.add(id);
    return id;
  }

  /**
   * Removes a single subscription.
   * @param {number} id
   */
  disconnect(id) {
    if (id == null || !this._connections.has(id)) return;
    try {
      this._manager.dpDisconnect(id);
    } catch (err) {
      if (this._logger) this._logger.warning('dpDisconnect(%d) failed: %s', id, err.message);
    } finally {
      this._connections.delete(id);
    }
  }

  /** Removes every subscription created through this client. */
  disconnectAll() {
    for (const id of [...this._connections]) {
      this.disconnect(id);
    }
  }
}

module.exports = { WinccoaClient };
