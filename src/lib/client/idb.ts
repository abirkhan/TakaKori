/**
 * A very small IndexedDB wrapper.
 *
 * No dependency, because this app has seven runtime dependencies on purpose
 * (ADR-026: users are on metered connections) and a query cache is not a place
 * to spend 15 KB on an abstraction this small.
 *
 * Everything here fails soft. IndexedDB is unavailable in Safari private mode,
 * throws on `getItem` when storage is full, and can be evicted wholesale on iOS.
 * A cache that throws takes the app down with it, so every operation resolves
 * rather than rejects, and a missing database is indistinguishable from an empty
 * one. The caller is a cache: losing it must mean "fetch again", never "crash".
 */

const DB_NAME = 'takakori'
const DB_VERSION = 1

export type StoreName = 'cache' | 'outbox'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache')
        if (!db.objectStoreNames.contains('outbox')) {
          // Keyed by a client-generated uuid, so a replayed write is the same
          // record rather than a second one. See `outbox.ts`.
          db.createObjectStore('outbox', { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      // A blocked upgrade can hang indefinitely when another tab holds the old
      // version open. A cache that waits forever is worse than no cache.
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        let request: IDBRequest
        try {
          request = work(db.transaction(store, mode).objectStore(store))
        } catch {
          return resolve(null)
        }
        request.onsuccess = () => resolve((request.result ?? null) as T | null)
        request.onerror = () => resolve(null)
      }),
  )
}

export function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  return run<T>(store, 'readonly', (s) => s.get(key))
}

export function idbSet(store: StoreName, key: string, value: unknown): Promise<unknown> {
  return run(store, 'readwrite', (s) =>
    /**
     * `put(value, key)` is only legal on an **out-of-line** key store.
     *
     * `cache` is created without a `keyPath`, so passing the key is correct and
     * required — that is why its rows have to be stored as `[key, value]` for
     * `getAll` to be readable at all. `outbox` is created *with* `keyPath: 'id'`,
     * and supplying a key there throws:
     *
     *     DataError: The object store uses in-line keys and the key parameter
     *     was provided.
     *
     * Which means `idbSet` could never write to `outbox` — the store sat empty and
     * silent from the day it was created, and nothing caught it because every test
     * mocked IndexedDB and the only real writer was the one caller that was not
     * written yet. Branching on `keyPath` is the whole fix, and the contract is
     * unchanged either way: `put` resolves with the key, so a string means stored
     * and `null` means not. See ADR-043 for why the outbox cares about that
     * distinction.
     */
    s.keyPath ? s.put(value) : s.put(value, key),
  )
}

export function idbDelete(store: StoreName, key: string): Promise<unknown> {
  return run(store, 'readwrite', (s) => s.delete(key))
}

export function idbAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll()).then((rows) => rows ?? [])
}

export function idbClear(store: StoreName): Promise<unknown> {
  return run(store, 'readwrite', (s) => s.clear())
}
