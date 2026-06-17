'use strict';

const { MappingStore } = require('./mapping/MappingStore');
const { DataMapper } = require('./mapping/DataMapper');
const { ZplTemplate } = require('./printer/ZplTemplate');
const { createPrinter } = require('./printer/PrinterFactory');

/**
 * Orchestrates the whole flow:
 *
 *   1. load the JSON mapping from the config DPE,
 *   2. dpConnect to every field DPE (and the optional trigger DPE),
 *   3. keep an in-memory cache of the latest DPE values,
 *   4. when a print is triggered, map values -> render ZPL -> send to printer,
 *   5. watch the config DPE so the mapping can be changed live without a restart.
 *
 * Trigger behaviour (mapping.trigger):
 *   - no trigger      : print whenever any field DPE changes (debounced),
 *   - { dpe, mode }   : print when the trigger DPE fires
 *        mode = "onTrue"   -> when the value becomes truthy (default),
 *        mode = "onChange" -> on every value change,
 *        mode = "any"      -> on every notification.
 *   - trigger.resetAfterPrint: write the trigger DPE back to false after a print.
 */
class ZebraLabelManager {
  /**
   * @param {object} options
   * @param {import('./winccoa/WinccoaClient').WinccoaClient} options.winccoaClient
   * @param {string} options.configDpe DPE holding the JSON mapping
   * @param {import('./logger').Logger} options.logger
   * @param {number} [options.debounceMs=250]
   */
  constructor({ winccoaClient, configDpe, logger, debounceMs = 250 }) {
    this._winccoa = winccoaClient;
    this._logger = logger;
    this._debounceMs = debounceMs;
    this._store = new MappingStore(winccoaClient, configDpe);

    /** @type {Map<string, unknown>} dpe -> latest value */
    this._cache = new Map();
    this._mapping = null;
    this._mapper = null;
    this._template = null;
    this._printer = null;

    this._fieldConnId = null;
    this._triggerConnId = null;
    this._configConnId = null;

    this._fieldsInitialized = false;
    this._triggerInitialized = false;
    this._lastTriggerValue = undefined;

    this._debounceTimer = null;
    this._printing = false;
    this._printQueued = false;
  }

  /** Loads the mapping, wires up subscriptions and starts watching the config DPE. */
  async start() {
    const mapping = await this._store.load();
    this._applyMapping(mapping);
    this._watchConfig();
    this._logger.info(
      'Started. mode=%s, target=%s, fields=%d, configDpe=%s',
      mapping.printMode,
      this._printer.describe(),
      mapping.fields.length,
      this._store.configDpe,
    );
  }

  /** Tears down every subscription. */
  stop() {
    this._clearDebounce();
    this._winccoa.disconnect(this._fieldConnId);
    this._winccoa.disconnect(this._triggerConnId);
    this._winccoa.disconnect(this._configConnId);
    this._fieldConnId = this._triggerConnId = this._configConnId = null;
  }

  /**
   * Builds the runtime objects for a mapping and (re)subscribes to its DPEs.
   * @param {import('./mapping/MappingStore').Mapping} mapping
   */
  _applyMapping(mapping) {
    // Drop previous field/trigger subscriptions (config subscription is kept).
    this._winccoa.disconnect(this._fieldConnId);
    this._winccoa.disconnect(this._triggerConnId);
    this._fieldConnId = this._triggerConnId = null;

    this._mapping = mapping;
    this._mapper = new DataMapper(mapping.fields);
    this._template = new ZplTemplate(mapping.template, {
      sanitize: mapping.sanitizeValues !== false,
    });
    this._printer = createPrinter(mapping);

    this._cache.clear();
    this._fieldsInitialized = false;
    this._triggerInitialized = false;
    this._lastTriggerValue = undefined;

    this._warnAboutMissing();

    const dpes = this._mapper.dpeList();
    if (dpes.length > 0) {
      this._fieldConnId = this._winccoa.connect(
        dpes,
        (names, values) => this._onFieldUpdate(names, values),
        true,
      );
    }

    const triggerDpe = mapping.trigger && mapping.trigger.dpe;
    if (triggerDpe) {
      this._triggerConnId = this._winccoa.connect(
        [triggerDpe],
        (names, values) => this._onTriggerUpdate(values[0]),
        true,
      );
    }

    this._logger.debug(
      'Mapping applied: mode=%s, fields=[%s], trigger=%s, debounceMs=%d',
      mapping.printMode,
      dpes.join(', '),
      triggerDpe ? `${triggerDpe} (${(mapping.trigger && mapping.trigger.mode) || 'onTrue'})` : 'none',
      this._debounceMs,
    );
  }

  /** Logs a warning for any DPE referenced by the mapping that does not exist. */
  _warnAboutMissing() {
    const dpes = new Set(this._mapper.dpeList());
    if (this._mapping.trigger && this._mapping.trigger.dpe) {
      dpes.add(this._mapping.trigger.dpe);
    }
    for (const dpe of dpes) {
      if (!this._winccoa.dpExists(dpe)) {
        this._logger.warning('Mapping references DPE "%s" which does not exist.', dpe);
      }
    }
    // Cross-check template placeholders against declared field names.
    const fieldNames = new Set(this._mapping.fields.map((f) => f.name));
    for (const ph of this._template.placeholders()) {
      if (!fieldNames.has(ph)) {
        this._logger.warning('Template placeholder "{{%s}}" has no matching field.', ph);
      }
    }
  }

  /**
   * @param {string[]} names
   * @param {unknown[]} values
   */
  _onFieldUpdate(names, values) {
    for (let i = 0; i < names.length; i += 1) {
      this._cache.set(names[i], values[i]);
      this._logger.debug('Field update: %s = %s', names[i], String(values[i]));
    }
    if (!this._fieldsInitialized) {
      this._fieldsInitialized = true; // initial snapshot: prime cache, do not print
      this._logger.debug('Initial field snapshot cached (%d DPE).', names.length);
      return;
    }
    // Auto-print only when no explicit trigger DPE is configured.
    if (!(this._mapping.trigger && this._mapping.trigger.dpe)) {
      this._scheduleDebouncedPrint();
    }
  }

  /**
   * @param {unknown} value current value of the trigger DPE
   */
  _onTriggerUpdate(value) {
    const prev = this._lastTriggerValue;
    this._lastTriggerValue = value;

    if (!this._triggerInitialized) {
      this._triggerInitialized = true; // ignore the initial snapshot
      return;
    }

    const mode = (this._mapping.trigger && this._mapping.trigger.mode) || 'onTrue';
    let shouldPrint = false;
    if (mode === 'any') shouldPrint = true;
    else if (mode === 'onChange') shouldPrint = value !== prev;
    else shouldPrint = ZebraLabelManager._truthy(value) && !ZebraLabelManager._truthy(prev);

    this._logger.debug(
      'Trigger update: value=%s prev=%s mode=%s -> print=%s',
      String(value),
      String(prev),
      mode,
      shouldPrint,
    );
    if (!shouldPrint) return;

    this._requestPrint()
      .then(() => this._maybeResetTrigger())
      .catch(() => {});
  }

  _maybeResetTrigger() {
    const t = this._mapping.trigger;
    if (t && t.dpe && t.resetAfterPrint) {
      this._winccoa.dpSet([t.dpe], [false]);
    }
  }

  _scheduleDebouncedPrint() {
    this._clearDebounce();
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._requestPrint().catch(() => {});
    }, this._debounceMs);
  }

  _clearDebounce() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * Serialises print requests: if a print is already running, a single follow-up
   * print is queued so the most recent data is always honoured.
   * @returns {Promise<void>}
   */
  async _requestPrint() {
    if (this._printing) {
      this._printQueued = true;
      return;
    }
    this._printing = true;
    try {
      await this._doPrint();
    } finally {
      this._printing = false;
      if (this._printQueued) {
        this._printQueued = false;
        await this._requestPrint();
      }
    }
  }

  /** Renders the current values and sends them to the printer. */
  async _doPrint() {
    let zpl;
    try {
      const values = this._mapper.map(this._cache);
      zpl = this._template.render(values);
      this._logger.debug('Mapped field values: %s', JSON.stringify(values));
      this._logger.debug('Rendered ZPL (%d bytes):\n%s', zpl.length, zpl);
    } catch (err) {
      this._logger.severe('Failed to render label: %s', err.message);
      this._writeStatus(`render error: ${err.message}`);
      return;
    }

    try {
      const jobInfo = await this._printer.print(zpl);
      this._logger.info(
        'Label sent to %s%s',
        this._printer.describe(),
        jobInfo != null ? ` (job ${jobInfo})` : '',
      );
      this._writeStatus(`ok ${new Date().toISOString()}`);
    } catch (err) {
      this._logger.severe('Print failed (%s): %s', this._printer.describe(), err.message);
      this._writeStatus(`print error: ${err.message}`);
    }
  }

  /**
   * Writes a short status string to the optional status DPE.
   * @param {string} text
   */
  _writeStatus(text) {
    const dpe = this._mapping.status && this._mapping.status.dpe;
    if (!dpe) return;
    try {
      this._winccoa.dpSet([dpe], [text]);
    } catch (err) {
      this._logger.warning('Could not write status DPE "%s": %s', dpe, err.message);
    }
  }

  /** Subscribes to the config DPE so mapping changes are applied live. */
  _watchConfig() {
    let initialized = false;
    this._configConnId = this._winccoa.connect(
      [this._store.configDpe],
      (names, values) => {
        if (!initialized) {
          initialized = true; // we already loaded the mapping in start()
          return;
        }
        try {
          const mapping = MappingStore.parse(values[0]);
          this._applyMapping(mapping);
          this._logger.info('Mapping reloaded from config DPE (live update).');
        } catch (err) {
          this._logger.severe('Ignoring invalid config DPE update: %s', err.message);
        }
      },
      true,
    );
  }

  /** Manually trigger a print using the cached values (useful for testing/CLI). */
  async printNow() {
    await this._requestPrint();
  }

  /**
   * @param {unknown} v
   * @returns {boolean}
   */
  static _truthy(v) {
    return v === true || v === 1 || v === '1' || v === 'true';
  }
}

module.exports = { ZebraLabelManager };
