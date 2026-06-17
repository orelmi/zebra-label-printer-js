'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { DataMapper } = require('../src/mapping/DataMapper');
const { ZplTemplate } = require('../src/printer/ZplTemplate');
const { MappingStore, validateMapping } = require('../src/mapping/MappingStore');
const { createPrinter } = require('../src/printer/PrinterFactory');
const { TcpPrinter } = require('../src/printer/TcpPrinter');
const { SpoolerPrinter } = require('../src/printer/SpoolerPrinter');
const { Logger } = require('../src/logger');

test('Logger.debug is gated and routed to logDebugF when available', () => {
  const calls = { debug: [], info: [] };
  const fakeWinccoa = {
    logInfo: (m) => calls.info.push(m),
    logDebugF: (m) => calls.debug.push(m),
  };

  const off = new Logger(fakeWinccoa, '[t]', false);
  off.debug('hidden');
  assert.strictEqual(calls.debug.length, 0, 'debug suppressed when disabled');

  const on = new Logger(fakeWinccoa, '[t]', true);
  on.debug('shown %s', 'x');
  assert.strictEqual(calls.debug.length, 1, 'debug routed to logDebugF when enabled');

  on.setDebug(false);
  on.debug('hidden again');
  assert.strictEqual(calls.debug.length, 1);
});

test('DataMapper applies defaults and transforms', () => {
  const mapper = new DataMapper([
    { name: 'a', dpe: 'D.a', transform: 'upper' },
    { name: 'b', dpe: 'D.b', default: 'X' },
    { name: 'c', dpe: 'D.c', transform: { type: 'fixed', decimals: 2 } },
    { name: 'd', dpe: 'D.d', transform: { type: 'padStart', length: 4, pad: '0' } },
  ]);
  const cache = new Map([
    ['D.a', 'hello'],
    ['D.b', ''],
    ['D.c', 3.14159],
    ['D.d', '7'],
  ]);
  assert.deepStrictEqual(mapper.map(cache), { a: 'HELLO', b: 'X', c: '3.14', d: '0007' });
  assert.deepStrictEqual(mapper.dpeList(), ['D.a', 'D.b', 'D.c', 'D.d']);
});

test('DataMapper throws on unknown transform', () => {
  const mapper = new DataMapper([{ name: 'a', dpe: 'D.a', transform: 'nope' }]);
  assert.throws(() => mapper.map(new Map([['D.a', 1]])), /Unknown transform/);
});

test('ZplTemplate renders placeholders and sanitizes values', () => {
  const tpl = new ZplTemplate('^FD{{name}}^FS {{missing}}');
  assert.deepStrictEqual(tpl.placeholders().sort(), ['missing', 'name']);
  assert.strictEqual(tpl.render({ name: 'AB^CD~E' }), '^FDAB CD E^FS ');
});

test('ZplTemplate can keep unknown placeholders and skip sanitizing', () => {
  const tpl = new ZplTemplate('{{a}}|{{b}}', { keepUnknown: true, sanitize: false });
  assert.strictEqual(tpl.render({ a: '^X' }), '^X|{{b}}');
});

test('ZplTemplate substitutes a field used several times (print + RFID encode)', () => {
  // The same value is printed as human-readable text AND encoded into an RFID tag.
  const tpl = new ZplTemplate('^FO50,50^FD{{serial}}^FS\n^RFW,H^FD{{serial}}^FS\n^FD{{serial}}^FS');
  assert.deepStrictEqual(tpl.placeholders(), ['serial']);
  assert.strictEqual(
    tpl.render({ serial: 'SN-001' }),
    '^FO50,50^FDSN-001^FS\n^RFW,H^FDSN-001^FS\n^FDSN-001^FS',
  );
});

test('validateMapping rejects bad documents', () => {
  assert.throws(() => validateMapping({}), /printMode/);
  assert.throws(() => validateMapping({ printMode: 'tcp', template: 't', fields: [] }), /tcp.host/);
  assert.throws(
    () => validateMapping({ printMode: 'spooler', fields: [] }),
    /template/,
  );
  assert.throws(
    () =>
      validateMapping({
        printMode: 'spooler',
        template: 't',
        fields: [{ name: 'a', dpe: 'X' }, { name: 'a', dpe: 'Y' }],
      }),
    /Duplicate/,
  );
});

test('MappingStore.parse accepts a valid JSON string', () => {
  const json = JSON.stringify({
    printMode: 'tcp',
    tcp: { host: '1.2.3.4' },
    template: '^XA^XZ',
    fields: [{ name: 'a', dpe: 'D.a' }],
  });
  const m = MappingStore.parse(json);
  assert.strictEqual(m.tcp.host, '1.2.3.4');
});

test('PrinterFactory builds the right printer type', () => {
  const tcp = createPrinter({ printMode: 'tcp', tcp: { host: '10.0.0.1' }, template: 't', fields: [] });
  assert.ok(tcp instanceof TcpPrinter);
  assert.match(tcp.describe(), /^tcp:\/\/10\.0\.0\.1:9100$/);

  const sp = createPrinter({
    printMode: 'spooler',
    spooler: { printerName: 'Zebra' },
    template: 't',
    fields: [],
  });
  assert.ok(sp instanceof SpoolerPrinter);
  assert.match(sp.describe(), /spooler:\/\/Zebra/);
});

test('SpoolerPrinter sends RAW data through an injected module', async () => {
  const calls = [];
  const fakeModule = {
    printDirect(opts) {
      calls.push(opts);
      opts.success('job-1');
    },
  };
  const printer = new SpoolerPrinter({ printerName: 'Z', printerModule: fakeModule });
  const job = await printer.print('^XA^XZ');
  assert.strictEqual(job, 'job-1');
  assert.strictEqual(calls[0].type, 'RAW');
  assert.strictEqual(calls[0].printer, 'Z');
  assert.ok(Buffer.isBuffer(calls[0].data));
});
