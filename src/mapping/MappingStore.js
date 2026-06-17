'use strict';

/**
 * Loads and saves the JSON mapping/configuration stored in a single string DPE.
 *
 * The whole behaviour of the manager is described by this JSON document:
 *   - which print mode to use (tcp / spooler) and its connection parameters,
 *   - the ZPL template with {{field}} placeholders,
 *   - the list of fields and the DPE each one is bound to,
 *   - an optional trigger DPE that starts a print.
 *
 * See examples/mapping.example.json and validateMapping() below for the schema.
 */

/**
 * @typedef {object} FieldMapping
 * @property {string} name placeholder name used in the template ({{name}})
 * @property {string} dpe  source datapoint element
 * @property {*} [default] value used when the DPE has no/empty value
 * @property {string|object} [transform] transform name or {type, ...options}
 *
 * @typedef {object} Mapping
 * @property {number} [version]
 * @property {('tcp'|'spooler')} printMode
 * @property {{host:string, port?:number, timeoutMs?:number}} [tcp]
 * @property {{printerName?:string}} [spooler]
 * @property {string} [encoding] byte encoding for the ZPL payload (default latin1)
 * @property {string} template ZPL with {{field}} placeholders
 * @property {FieldMapping[]} fields
 * @property {{dpe?:string, mode?:('onTrue'|'onChange'|'any')}} [trigger]
 * @property {{dpe?:string}} [status] optional DPE to write a short status string to
 */

class MappingStore {
  /**
   * @param {import('../winccoa/WinccoaClient').WinccoaClient} winccoaClient
   * @param {string} configDpe DPE that contains the JSON document
   */
  constructor(winccoaClient, configDpe) {
    this._winccoa = winccoaClient;
    this._configDpe = configDpe;
  }

  get configDpe() {
    return this._configDpe;
  }

  /**
   * Reads the JSON document from the config DPE and validates it.
   * @returns {Promise<Mapping>}
   */
  async load() {
    if (!this._winccoa.dpExists(this._configDpe)) {
      throw new Error(`Config DPE "${this._configDpe}" does not exist.`);
    }
    const result = await this._winccoa.dpGet([this._configDpe]);
    const raw = Array.isArray(result) ? result[0] : result;
    return MappingStore.parse(raw);
  }

  /**
   * Serialises and writes a mapping back into the config DPE.
   * @param {Mapping} mapping
   * @returns {boolean}
   */
  save(mapping) {
    validateMapping(mapping);
    const json = JSON.stringify(mapping, null, 2);
    return this._winccoa.dpSet([this._configDpe], [json]);
  }

  /**
   * Parses and validates a raw JSON string (or already-parsed object).
   * @param {string|object} raw
   * @returns {Mapping}
   */
  static parse(raw) {
    if (raw == null || raw === '') {
      throw new Error('Config DPE is empty; expected a JSON mapping document.');
    }
    let mapping;
    if (typeof raw === 'string') {
      try {
        mapping = JSON.parse(raw);
      } catch (err) {
        throw new Error(`Config DPE does not contain valid JSON: ${err.message}`);
      }
    } else if (typeof raw === 'object') {
      mapping = raw;
    } else {
      throw new Error(`Unexpected config DPE value of type ${typeof raw}.`);
    }
    validateMapping(mapping);
    return mapping;
  }
}

/**
 * Validates a mapping document, throwing on the first problem found.
 * @param {Mapping} mapping
 */
function validateMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    throw new Error('Mapping must be an object.');
  }
  if (mapping.printMode !== 'tcp' && mapping.printMode !== 'spooler') {
    throw new Error('Mapping.printMode must be "tcp" or "spooler".');
  }
  if (mapping.printMode === 'tcp') {
    if (!mapping.tcp || typeof mapping.tcp.host !== 'string' || !mapping.tcp.host) {
      throw new Error('Mapping.tcp.host is required for printMode "tcp".');
    }
  }
  if (typeof mapping.template !== 'string' || !mapping.template.trim()) {
    throw new Error('Mapping.template (ZPL string) is required.');
  }
  if (!Array.isArray(mapping.fields)) {
    throw new Error('Mapping.fields must be an array.');
  }
  const seen = new Set();
  mapping.fields.forEach((f, i) => {
    if (!f || typeof f !== 'object') {
      throw new Error(`Mapping.fields[${i}] must be an object.`);
    }
    if (typeof f.name !== 'string' || !f.name) {
      throw new Error(`Mapping.fields[${i}].name is required.`);
    }
    if (seen.has(f.name)) {
      throw new Error(`Duplicate field name "${f.name}".`);
    }
    seen.add(f.name);
    if (typeof f.dpe !== 'string' || !f.dpe) {
      throw new Error(`Mapping.fields[${i}].dpe is required.`);
    }
  });
  if (mapping.trigger && mapping.trigger.dpe != null && typeof mapping.trigger.dpe !== 'string') {
    throw new Error('Mapping.trigger.dpe must be a string when provided.');
  }
}

module.exports = { MappingStore, validateMapping };
