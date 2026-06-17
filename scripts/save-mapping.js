'use strict';

/**
 * Utility to push a JSON mapping file into the configuration DPE.
 *
 * Usage (run as a WinCC OA JS manager / with the manager available):
 *   node scripts/save-mapping.js examples/mapping.example.json [-configDpe <name>]
 *
 * The file is validated before it is written so an invalid document never lands
 * in the DPE.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/config');
const { Logger } = require('../src/logger');
const { WinccoaClient } = require('../src/winccoa/WinccoaClient');
const { MappingStore } = require('../src/mapping/MappingStore');

function main() {
  const logger = new Logger();
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!fileArg) {
    logger.severe('Usage: node scripts/save-mapping.js <mapping.json> [-configDpe <name>]');
    process.exit(2);
    return;
  }

  const filePath = path.resolve(fileArg);
  let mapping;
  try {
    mapping = MappingStore.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.severe('Invalid mapping file "%s": %s', filePath, err.message);
    process.exit(1);
    return;
  }

  const { configDpe } = loadConfig();
  let client;
  try {
    client = new WinccoaClient({ logger });
  } catch (err) {
    logger.severe('Cannot initialise WinCC OA manager: %s', err.message);
    process.exit(1);
    return;
  }

  const store = new MappingStore(client, configDpe);
  if (!client.dpExists(configDpe)) {
    logger.severe('Config DPE "%s" does not exist; create it first (string DPE).', configDpe);
    process.exit(1);
    return;
  }

  const ok = store.save(mapping);
  if (ok) {
    logger.info('Saved mapping from "%s" into config DPE "%s".', filePath, configDpe);
  } else {
    logger.severe('dpSet returned false while writing config DPE "%s".', configDpe);
    process.exit(1);
  }
  // One-shot script: let the manager flush, then exit.
  if (typeof client.manager.exit === 'function') {
    client.manager.exit(0);
  }
}

main();
