'use strict';

/**
 * Sends raw ZPL to a printer installed in the Windows print spooler.
 *
 * Uses `@thiagoelg/node-printer` (the maintained fork of node-printer) and its
 * `printDirect({ type: 'RAW' })` call, which hands the bytes to the spooler
 * untouched so the Zebra ZPL engine interprets them directly (the driver does
 * not try to rasterise them).
 *
 * The native addon is lazy-required so this file — and the whole manager — load
 * fine on hosts where the optional dependency is not built (e.g. TCP-only
 * deployments or CI).
 */

class SpoolerPrinter {
  /**
   * @param {object} options
   * @param {string} [options.printerName] exact spooler name; default printer if omitted
   * @param {string} [options.encoding='latin1'] byte encoding for the payload
   * @param {object} [options.printerModule] injected module (for tests)
   */
  constructor({ printerName, encoding = 'latin1', printerModule } = {}) {
    this._printerName = printerName;
    this._encoding = encoding;
    this._printer = printerModule || null;
  }

  /** @returns {string} human-readable target */
  describe() {
    return `spooler://${this._printerName || '(default printer)'}`;
  }

  /** Lazily resolves the native printer module. */
  _module() {
    if (this._printer) return this._printer;
    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      this._printer = require('@thiagoelg/node-printer');
    } catch (err) {
      throw new Error(
        'Spooler print mode requires the optional native package ' +
          '"@thiagoelg/node-printer", which is not available. Install it with ' +
          '`npm install @thiagoelg/node-printer` (needs build tools), or use the ' +
          `"tcp" print mode instead. Original error: ${err.message}`,
      );
    }
    return this._printer;
  }

  /** @returns {Array} the printers known to the spooler */
  listPrinters() {
    return this._module().getPrinters();
  }

  /**
   * Queues the ZPL as a RAW print job.
   * @param {string|Buffer} zpl
   * @returns {Promise<*>} resolves with the spooler job id
   */
  print(zpl) {
    const printer = this._module();
    const data = Buffer.isBuffer(zpl) ? zpl : Buffer.from(zpl, this._encoding);

    return new Promise((resolve, reject) => {
      const options = {
        data,
        type: 'RAW',
        success: (jobId) => resolve(jobId),
        error: (err) => reject(err),
      };
      if (this._printerName) options.printer = this._printerName;
      try {
        printer.printDirect(options);
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = { SpoolerPrinter };
