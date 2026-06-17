'use strict';

/**
 * Entry point of the WinCC OA JavaScript manager.
 *
 * Start it as a WinCC OA JS manager (or with `node index.js`). The DPE that
 * holds the JSON mapping/configuration is resolved from `-configDpe <name>`,
 * the `ZEBRA_CONFIG_DPE` environment variable, or the built-in default.
 */

const { loadConfig } = require('./src/config');
const { Logger } = require('./src/logger');
const { WinccoaClient } = require('./src/winccoa/WinccoaClient');
const { ZebraLabelManager } = require('./src/ZebraLabelManager');

async function main() {
  const config = loadConfig();
  const logger = new Logger();

  let winccoaClient;
  try {
    winccoaClient = new WinccoaClient({ logger });
    logger.attachWinccoa(winccoaClient.manager);
  } catch (err) {
    logger.severe('Cannot initialise WinCC OA manager: %s', err.message);
    process.exit(1);
    return;
  }

  const manager = new ZebraLabelManager({
    winccoaClient,
    configDpe: config.configDpe,
    logger,
    debounceMs: config.debounceMs,
  });

  const shutdown = (signal) => {
    logger.info('Received %s, shutting down.', signal);
    manager.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await manager.start();
  } catch (err) {
    logger.severe('Failed to start: %s', err.message);
    process.exit(1);
  }
}

main();
