'use strict';

const { TcpPrinter } = require('./TcpPrinter');
const { SpoolerPrinter } = require('./SpoolerPrinter');

/**
 * Builds the printer implementation described by a mapping document.
 *
 * Both printers expose the same contract: `print(zpl) => Promise` and
 * `describe() => string`.
 *
 * @param {import('../mapping/MappingStore').Mapping} mapping
 * @returns {{print: (zpl: string|Buffer) => Promise<*>, describe: () => string}}
 */
function createPrinter(mapping) {
  const encoding = mapping.encoding || 'latin1';

  if (mapping.printMode === 'tcp') {
    const tcp = mapping.tcp || {};
    return new TcpPrinter({
      host: tcp.host,
      port: tcp.port,
      timeoutMs: tcp.timeoutMs,
      encoding,
    });
  }

  if (mapping.printMode === 'spooler') {
    const spooler = mapping.spooler || {};
    return new SpoolerPrinter({
      printerName: spooler.printerName,
      encoding,
    });
  }

  throw new Error(`Unsupported printMode "${mapping.printMode}".`);
}

module.exports = { createPrinter };
