'use strict';

/**
 * Sends raw ZPL straight to a Zebra printer over TCP/IP.
 *
 * Zebra Link-OS printers listen for raw print data on TCP port 9100 (the
 * standard "raw"/JetDirect port wired to the internal ZPL engine). No driver
 * and no spooler are involved, which makes this the most robust path for
 * networked printers. Implemented with Node's built-in `net` module.
 */

const net = require('net');

class TcpPrinter {
  /**
   * @param {object} options
   * @param {string} options.host printer IP / hostname
   * @param {number} [options.port=9100]
   * @param {number} [options.timeoutMs=5000] connect/idle timeout
   * @param {string} [options.encoding='latin1'] byte encoding for the payload
   */
  constructor({ host, port = 9100, timeoutMs = 5000, encoding = 'latin1' } = {}) {
    if (!host) throw new Error('TcpPrinter requires a host.');
    this._host = host;
    this._port = port;
    this._timeoutMs = timeoutMs;
    this._encoding = encoding;
  }

  /** @returns {string} human-readable target */
  describe() {
    return `tcp://${this._host}:${this._port}`;
  }

  /**
   * Opens a connection, writes the ZPL and closes the socket.
   * @param {string|Buffer} zpl
   * @returns {Promise<void>} resolves once the data has been flushed and the
   *   socket closed; rejects on connection error or timeout.
   */
  print(zpl) {
    const payload = Buffer.isBuffer(zpl) ? zpl : Buffer.from(zpl, this._encoding);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve();
      };

      const socket = net.createConnection({ host: this._host, port: this._port }, () => {
        socket.write(payload, (err) => {
          if (err) return finish(err);
          // Give the printer the bytes, then half-close to flush.
          return socket.end();
        });
      });

      socket.setTimeout(this._timeoutMs);
      socket.on('timeout', () =>
        finish(new Error(`Timeout after ${this._timeoutMs}ms talking to ${this.describe()}`)),
      );
      socket.on('error', finish);
      // 'close' is the reliable "all done" signal after end().
      socket.on('close', () => finish());
    });
  }
}

module.exports = { TcpPrinter };
