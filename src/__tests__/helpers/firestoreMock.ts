import { vi } from "vitest";

/**
 * A small in-memory stand-in for the Firestore client SDK, shared by the lib tests.
 *
 * The modules under test now write through `runTransaction` as well as `writeBatch`, and
 * they read documents (product stock, customer aggregates, counters) inside those
 * transactions. Mocking each call individually stopped being workable, so this models the
 * few pieces that actually matter: refs carry a real path, reads come from a seeded
 * document map, and every write is recorded for assertions.
 */

export interface DocRef {
  id: string;
  path: string;
}

export interface RecordedWrite {
  op: "set" | "update" | "delete";
  path: string;
  data?: Record<string, unknown>;
}

export interface FirestoreMock {
  /** Seeded documents, keyed by path (e.g. "products/10"). */
  documents: Map<string, Record<string, unknown>>;
  /** Every write issued through a batch or transaction, in order. */
  writes: RecordedWrite[];
  /** Auto-generated ids handed out by `doc(collectionRef)`, in order. */
  generatedIds: string[];
  reset(): void;
  seed(path: string, data: Record<string, unknown>): void;
  /** All writes that touched a given path. */
  writesFor(path: string): RecordedWrite[];
  /** The merged data of the last write to a path. */
  lastWriteData(path: string): Record<string, unknown> | undefined;
  /** The firebase/firestore module replacement. */
  module: Record<string, unknown>;
}

/**
 * The instance a test file shares with its `vi.mock("firebase/firestore")` factory. Vitest
 * gives every test file its own module registry, so this stays isolated per file:
 *
 *   vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);
 */
export const firestoreMock: FirestoreMock = createFirestoreMock();

export function createFirestoreMock(): FirestoreMock {
  const documents = new Map<string, Record<string, unknown>>();
  const writes: RecordedWrite[] = [];
  const generatedIds: string[] = [];
  let autoId = 0;

  const makeRef = (path: string): DocRef => ({ id: path.split("/").pop() ?? path, path });

  const snapshotFor = (ref: DocRef) => {
    const data = documents.get(ref.path);
    return {
      id: ref.id,
      ref,
      exists: () => data !== undefined,
      data: () => data,
    };
  };

  const record = (op: RecordedWrite["op"], ref: DocRef, data?: Record<string, unknown>) => {
    writes.push({ op, path: ref.path, data });
    if (op === "delete") {
      documents.delete(ref.path);
    } else if (data) {
      // Mirror the write back so a later read inside the same test sees it.
      documents.set(ref.path, op === "set" ? { ...data } : { ...(documents.get(ref.path) ?? {}), ...data });
    }
  };

  const writer = {
    set: vi.fn((ref: DocRef, data: Record<string, unknown>) => record("set", ref, data)),
    update: vi.fn((ref: DocRef, data: Record<string, unknown>) => record("update", ref, data)),
    delete: vi.fn((ref: DocRef) => record("delete", ref)),
    get: vi.fn(async (ref: DocRef) => snapshotFor(ref)),
    commit: vi.fn(async () => undefined),
  };

  const module = {
    // `collection(db, "name")` and `collection(db, "a", "b")` both resolve to a path.
    collection: vi.fn((_db: unknown, ...segments: string[]) => makeRef(segments.join("/"))),
    // `doc(db, ...segments)` addresses a document; `doc(collectionRef)` mints a new id.
    doc: vi.fn((first: unknown, ...segments: string[]) => {
      if (segments.length === 0 && first && typeof first === "object" && "path" in first) {
        autoId += 1;
        const id = `auto-${autoId}`;
        generatedIds.push(id);
        return makeRef(`${(first as DocRef).path}/${id}`);
      }
      return makeRef(segments.join("/"));
    }),
    getDoc: vi.fn(async (ref: DocRef) => snapshotFor(ref)),
    getDocs: vi.fn(async () => ({ docs: [], empty: true })),
    onSnapshot: vi.fn(),
    orderBy: vi.fn(),
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(),
    limit: vi.fn(),
    increment: vi.fn((amount: number) => ({ _increment: amount })),
    arrayUnion: vi.fn((...values: unknown[]) => ({ _arrayUnion: values })),
    arrayRemove: vi.fn((...values: unknown[]) => ({ _arrayRemove: values })),
    serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    Timestamp: { now: vi.fn(() => ({ _now: true })) },
    writeBatch: vi.fn(() => writer),
    runTransaction: vi.fn(async (_db: unknown, fn: (t: typeof writer) => Promise<unknown>) => fn(writer)),
  };

  return {
    documents,
    writes,
    generatedIds,
    module,
    reset() {
      documents.clear();
      writes.length = 0;
      generatedIds.length = 0;
      autoId = 0;
      Object.values(writer).forEach((fn) => fn.mockClear?.());
    },
    seed(path, data) {
      documents.set(path, data);
    },
    writesFor(path) {
      return writes.filter((w) => w.path === path);
    },
    lastWriteData(path) {
      const matching = writes.filter((w) => w.path === path && w.data);
      return matching.length > 0 ? matching[matching.length - 1].data : undefined;
    },
  };
}
