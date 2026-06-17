'use strict';

/**
 * Renders a ZPL template by substituting {{placeholder}} tokens with values.
 *
 * ZPL uses the caret (^) and tilde (~) characters as command introducers, so by
 * default substituted *values* have those characters stripped to avoid breaking
 * the label or allowing injection from field data. The template itself is never
 * sanitised — it is authored by the integrator and contains real ZPL commands.
 *
 * Pass `{ sanitize: false }` if a value is expected to contain ZPL on purpose.
 */

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

class ZplTemplate {
  /**
   * @param {string} template raw ZPL containing {{placeholder}} tokens
   * @param {object} [options]
   * @param {boolean} [options.sanitize=true] strip ^ and ~ from values
   * @param {boolean} [options.keepUnknown=false] leave unknown {{tokens}} as-is
   *        (default replaces them with an empty string)
   */
  constructor(template, { sanitize = true, keepUnknown = false } = {}) {
    if (typeof template !== 'string') {
      throw new Error('ZPL template must be a string.');
    }
    this._template = template;
    this._sanitize = sanitize;
    this._keepUnknown = keepUnknown;
  }

  /** @returns {string[]} placeholder names referenced by the template */
  placeholders() {
    const names = new Set();
    let m;
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(this._template)) !== null) {
      names.add(m[1]);
    }
    return [...names];
  }

  /**
   * @param {Object<string, string>} values placeholderName -> value
   * @returns {string} the rendered ZPL
   */
  render(values) {
    return this._template.replace(PLACEHOLDER, (whole, name) => {
      if (!Object.prototype.hasOwnProperty.call(values, name)) {
        return this._keepUnknown ? whole : '';
      }
      const raw = values[name];
      const str = raw == null ? '' : String(raw);
      return this._sanitize ? ZplTemplate.sanitizeValue(str) : str;
    });
  }

  /**
   * Removes the ZPL control characters (^ and ~) from a value.
   * @param {string} value
   * @returns {string}
   */
  static sanitizeValue(value) {
    return String(value).replace(/[\^~]/g, ' ');
  }
}

module.exports = { ZplTemplate };
