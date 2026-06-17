'use strict';

/**
 * Static configuration for the manager process.
 *
 * Only one thing is genuinely "static" for a WinCC OA manager: the name of the
 * DPE that holds the JSON mapping/configuration. Everything else (printer
 * address, ZPL template, field mapping, trigger ...) lives inside that DPE so
 * it can be changed at runtime from the UI without restarting the manager.
 *
 * The config DPE name can be supplied (in priority order) by:
 *   1. a `-configDpe <name>` / `--config-dpe <name>` command line argument
 *      (WinCC OA passes manager options on the command line),
 *   2. the `ZEBRA_CONFIG_DPE` environment variable,
 *   3. the built-in default below.
 */

const DEFAULT_CONFIG_DPE = '_ZebraLabelPrinter.config.mapping';

/**
 * Reads a `-key value` / `--key value` style option from an argv array.
 * @param {string[]} argv
 * @param {...string} names option names to look for (without value)
 * @returns {string|undefined}
 */
function readArg(argv, ...names) {
  for (let i = 0; i < argv.length - 1; i += 1) {
    if (names.includes(argv[i])) {
      return argv[i + 1];
    }
  }
  return undefined;
}

/**
 * Builds the runtime configuration of the manager.
 * @param {object} [overrides] explicit overrides (mostly for tests)
 * @param {string[]} [argv] argument vector, defaults to process.argv
 * @param {NodeJS.ProcessEnv} [env] environment, defaults to process.env
 * @returns {{ configDpe: string, debounceMs: number }}
 */
function loadConfig(overrides = {}, argv = process.argv, env = process.env) {
  const configDpe =
    overrides.configDpe ||
    readArg(argv, '-configDpe', '--config-dpe', '--configDpe') ||
    env.ZEBRA_CONFIG_DPE ||
    DEFAULT_CONFIG_DPE;

  // How long to wait after the last DPE change before printing, so that a burst
  // of related DPE updates results in a single label (only used when there is
  // no explicit trigger DPE).
  const debounceMs = Number(
    overrides.debounceMs ?? env.ZEBRA_DEBOUNCE_MS ?? 250,
  );

  // Debug logging: enabled by the `--debug` flag, the `ZEBRA_DEBUG` env var
  // (1/true/on/yes), or explicitly via overrides.
  const debug =
    overrides.debug ??
    (argv.includes('--debug') || argv.includes('-debug') ||
      /^(1|true|on|yes)$/i.test(String(env.ZEBRA_DEBUG || '')));

  return { configDpe, debounceMs, debug };
}

module.exports = { loadConfig, DEFAULT_CONFIG_DPE };
