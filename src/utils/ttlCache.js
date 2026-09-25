/**
 * A small in-memory cache whose entries expire, for data fetched again and again in a short time
 * (autocomplete asks on every keystroke). Concurrent loads of one key share a single request.
 */
class TtlCache {
    /**
     * @param {number} ttlMs how long an entry stays fresh
     * @param {number} maxEntries entries beyond this push out the oldest
     */
    constructor(ttlMs, maxEntries = 1000) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.entries = new Map();
    }

    get(key, now = Date.now()) {
        const entry = this.entries.get(key);
        if (!entry || entry.expiresAt <= now) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key, value, now = Date.now()) {
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: now + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value);
        }
        return value;
    }

    delete(key) {
        this.entries.delete(key);
    }

    /** The cached value, or the result of `load` (cached if it succeeds; a failure is not kept). */
    async getOrLoad(key, load) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const pending = load().then(
            (value) => this.set(key, value),
            (error) => {
                this.entries.delete(key);
                throw error;
            },
        );
        this.set(key, pending);
        return pending;
    }
}

module.exports = { TtlCache };
