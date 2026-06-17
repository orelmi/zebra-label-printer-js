'use strict';

/**
 * In-memory stand-in for WinccoaClient, used by the unit tests.
 * It records dpSet writes and lets tests emit dpConnect callbacks on demand.
 */
class FakeWinccoa {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.writes = [];
    this._nextId = 1;
    this._conns = new Map(); // id -> { dpes, cb }
  }

  dpExists(dpe) {
    return this.values.has(dpe);
  }

  async dpGet(dpes) {
    const list = Array.isArray(dpes) ? dpes : [dpes];
    return list.map((d) => this.values.get(d));
  }

  dpSet(dpes, values) {
    const list = Array.isArray(dpes) ? dpes : [dpes];
    const vals = Array.isArray(values) ? values : [values];
    list.forEach((d, i) => {
      this.values.set(d, vals[i]);
      this.writes.push({ dpe: d, value: vals[i] });
    });
    return true;
  }

  connect(dpes, cb, answer = true) {
    const id = this._nextId;
    this._nextId += 1;
    this._conns.set(id, { dpes, cb });
    if (answer) {
      // deliver current snapshot
      cb(dpes, dpes.map((d) => this.values.get(d)), 'answer');
    }
    return id;
  }

  disconnect(id) {
    this._conns.delete(id);
  }

  disconnectAll() {
    this._conns.clear();
  }

  /** Emit a value change for a single DPE to all matching subscriptions. */
  emit(dpe, value) {
    this.values.set(dpe, value);
    for (const { dpes, cb } of this._conns.values()) {
      if (dpes.includes(dpe)) {
        cb([dpe], [value], 'hotlink');
      }
    }
  }
}

module.exports = { FakeWinccoa };
