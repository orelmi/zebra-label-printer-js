'use strict';

/**
 * Turns raw DPE values into the set of placeholder values consumed by the ZPL
 * template, applying per-field defaults and transforms.
 *
 * A transform can be expressed either as a short string ("trim", "upper", ...)
 * or as an object `{ type: "fixed", decimals: 2 }` when it needs options.
 */

/**
 * Built-in transforms. Each receives (value, options) and returns the new value.
 */
const TRANSFORMS = {
  trim: (v) => String(v).trim(),
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  int: (v) => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? '' : String(n);
  },
  /** fixed-point number: { type:'fixed', decimals:2 } */
  fixed: (v, opts) => {
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    return n.toFixed(opts && opts.decimals != null ? opts.decimals : 0);
  },
  /** pad start: { type:'padStart', length:6, pad:'0' } */
  padStart: (v, opts) =>
    String(v).padStart((opts && opts.length) || 0, (opts && opts.pad) || ' '),
  /** slice: { type:'slice', start:0, end:20 } */
  slice: (v, opts) =>
    String(v).slice((opts && opts.start) || 0, opts && opts.end != null ? opts.end : undefined),
  /** ISO date/time of "now" or of a parseable value: { type:'date', format:'iso'|'date'|'time' } */
  date: (v, opts) => {
    const d = v === '' || v == null || v === 'now' ? new Date() : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    const fmt = (opts && opts.format) || 'iso';
    if (fmt === 'date') return d.toISOString().slice(0, 10);
    if (fmt === 'time') return d.toISOString().slice(11, 19);
    return d.toISOString();
  },
};

class DataMapper {
  /**
   * @param {import('./MappingStore').FieldMapping[]} fields
   */
  constructor(fields) {
    this._fields = fields || [];
  }

  /** @returns {string[]} the list of DPEs this mapper reads from */
  dpeList() {
    return this._fields.map((f) => f.dpe);
  }

  /**
   * Computes the placeholder values from a cache of DPE values.
   * @param {Map<string, unknown>|Object<string, unknown>} valueCache dpe -> value
   * @returns {Object<string, string>} placeholderName -> rendered string value
   */
  map(valueCache) {
    const get = (dpe) =>
      valueCache instanceof Map ? valueCache.get(dpe) : valueCache[dpe];

    const out = {};
    for (const field of this._fields) {
      let value = get(field.dpe);
      if (value === undefined || value === null || value === '') {
        value = field.default !== undefined ? field.default : '';
      }
      value = DataMapper._applyTransform(value, field.transform);
      out[field.name] = value == null ? '' : String(value);
    }
    return out;
  }

  /**
   * @param {*} value
   * @param {string|object|undefined} transform
   * @returns {*}
   */
  static _applyTransform(value, transform) {
    if (!transform) return value;
    const def = typeof transform === 'string' ? { type: transform } : transform;
    const fn = TRANSFORMS[def.type];
    if (!fn) {
      throw new Error(`Unknown transform "${def.type}".`);
    }
    return fn(value, def);
  }
}

module.exports = { DataMapper, TRANSFORMS };
