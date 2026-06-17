'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { ZebraLabelManager } = require('../src/ZebraLabelManager');
const { Logger } = require('../src/logger');
const { FakeWinccoa } = require('./helpers/FakeWinccoa');

const CONFIG_DPE = '_Cfg.mapping';

/** Builds a manager whose printer is replaced by an in-memory recorder. */
function buildManager(mapping, initialValues = {}) {
  const fake = new FakeWinccoa({
    [CONFIG_DPE]: JSON.stringify(mapping),
    ...initialValues,
  });
  const logger = new Logger(null, '[test]');
  // Silence the console during tests.
  logger.info = () => {};
  logger.warning = () => {};
  logger.severe = () => {};

  const manager = new ZebraLabelManager({
    winccoaClient: fake,
    configDpe: CONFIG_DPE,
    logger,
    debounceMs: 5,
  });

  const printed = [];
  // Replace the printer factory result after start by stubbing _doPrint's printer.
  const origApply = manager._applyMapping.bind(manager);
  manager._applyMapping = (m) => {
    origApply(m);
    manager._printer = {
      describe: () => 'fake://printer',
      print: async (zpl) => {
        printed.push(zpl);
        return 'job';
      },
    };
  };
  return { manager, fake, printed };
}

const TRIGGER_MAPPING = {
  printMode: 'tcp',
  tcp: { host: '1.2.3.4' },
  trigger: { dpe: 'D.print', mode: 'onTrue', resetAfterPrint: true },
  template: '^XA^FD{{a}}^FS^XZ',
  fields: [{ name: 'a', dpe: 'D.a', default: 'def' }],
};

test('prints when the trigger DPE becomes true and not on the initial snapshot', async () => {
  const { manager, fake, printed } = buildManager(TRIGGER_MAPPING, {
    'D.a': 'VALUE',
    'D.print': false,
  });
  await manager.start();
  assert.strictEqual(printed.length, 0, 'no print on startup');

  fake.emit('D.a', 'UPDATED'); // field change alone must NOT print (trigger configured)
  await delay(20);
  assert.strictEqual(printed.length, 0);

  fake.emit('D.print', true);
  await delay(20);
  assert.strictEqual(printed.length, 1);
  assert.strictEqual(printed[0], '^XA^FDUPDATED^FS^XZ');

  // resetAfterPrint should have written the trigger back to false
  assert.ok(fake.writes.some((w) => w.dpe === 'D.print' && w.value === false));
  manager.stop();
});

test('auto-prints (debounced) on field change when no trigger is configured', async () => {
  const mapping = {
    printMode: 'tcp',
    tcp: { host: '1.2.3.4' },
    template: '^XA^FD{{a}}^FS^XZ',
    fields: [{ name: 'a', dpe: 'D.a', default: 'def' }],
  };
  const { manager, fake, printed } = buildManager(mapping, { 'D.a': 'X' });
  await manager.start();
  assert.strictEqual(printed.length, 0);

  fake.emit('D.a', 'one');
  fake.emit('D.a', 'two'); // burst -> coalesced into one print
  await delay(30);
  assert.strictEqual(printed.length, 1);
  assert.strictEqual(printed[0], '^XA^FDtwo^FS^XZ');
  manager.stop();
});

test('reloads the mapping live when the config DPE changes', async () => {
  const { manager, fake, printed } = buildManager(TRIGGER_MAPPING, {
    'D.a': 'V1',
    'D.print': false,
  });
  await manager.start();

  const newMapping = {
    ...TRIGGER_MAPPING,
    template: '^XA^FDNEW {{a}}^FS^XZ',
  };
  fake.emit(CONFIG_DPE, JSON.stringify(newMapping));
  await delay(10);

  fake.emit('D.print', true);
  await delay(20);
  assert.strictEqual(printed.length, 1);
  assert.strictEqual(printed[0], '^XA^FDNEW V1^FS^XZ');
  manager.stop();
});

test('uses default value when the source DPE is empty', async () => {
  const { manager, fake, printed } = buildManager(TRIGGER_MAPPING, {
    'D.a': '',
    'D.print': false,
  });
  await manager.start();
  fake.emit('D.print', true);
  await delay(20);
  assert.strictEqual(printed[0], '^XA^FDdef^FS^XZ');
  manager.stop();
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
