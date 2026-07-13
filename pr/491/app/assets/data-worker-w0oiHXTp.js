import {
  PortSQLiteAdapter,
  encodeWorkerQuerySnapshot,
  groupNodeChangeEventsBySchema
} from "../chunk-EUC74VKB.js";
import {
  applyNodeChangeToBoundedQueryResult,
  applyNodeChangeToQueryResult,
  createBoundedWorkingSet,
  createBoundedWorkingSetDescriptor,
  createQueryDescriptor,
  queryDescriptorSupportsBoundedDelta,
  reuseEquivalentNodeReferences
} from "../chunk-5GTIP33X.js";

// src/worker/data-worker.ts
import { expose } from "comlink";

// src/worker/data-worker-host.ts
import {
  NodeStore,
  MemoryNodeStorageAdapter,
  SQLiteNodeStorageAdapter
} from "@xnetjs/data";
import { createWebCryptoChangeSigner } from "@xnetjs/sync";
import { proxy, transfer } from "comlink";
import * as Y from "yjs";
var BULK_STORE_CHANGE_RELOAD_THRESHOLD = 250;
var MAX_DOC_POOL_SIZE = 50;
var MIN_DOC_AGE_FOR_EVICTION = 6e4;
function mergePreviousNodeReferences(nextNodes, previousNodes, previousWorkingSet) {
  return reuseEquivalentNodeReferences(nextNodes, [
    ...previousWorkingSet?.nodes ?? [],
    ...previousNodes ?? []
  ]);
}
function computeQueryDelta(previous, next) {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  const nextIds = new Set(next.map((node) => node.id));
  const added = next.filter((node) => !previousById.has(node.id));
  const removed = previous.filter((node) => !nextIds.has(node.id));
  if (added.length === 0 && removed.length === 0) {
    const changed = next.filter((node) => previousById.get(node.id) !== node);
    if (changed.length === 0) return null;
    if (changed.length === 1) {
      return { type: "update", nodeId: changed[0].id, node: changed[0] };
    }
    return { type: "reload", data: next };
  }
  if (added.length === 1 && removed.length === 0) {
    const othersUntouched = next.every(
      (node) => node.id === added[0].id || previousById.get(node.id) === node
    );
    if (othersUntouched) {
      return {
        type: "add",
        node: added[0],
        index: next.findIndex((node) => node.id === added[0].id)
      };
    }
    return { type: "reload", data: next };
  }
  if (removed.length === 1 && added.length === 0) {
    const othersUntouched = next.every((node) => previousById.get(node.id) === node);
    if (othersUntouched) {
      return { type: "remove", nodeId: removed[0].id };
    }
    return { type: "reload", data: next };
  }
  return { type: "reload", data: next };
}
var DataWorker = class {
  store = null;
  storage = null;
  subscriptions = /* @__PURE__ */ new Map();
  status = "disconnected";
  statusHandlers = /* @__PURE__ */ new Set();
  changeFeedHandlers = /* @__PURE__ */ new Set();
  storeUnsubscribe = null;
  storeBatchUnsubscribe = null;
  pendingStoreChanges = [];
  storeChangeFlushQueued = false;
  // Y.Doc pool - the "source of truth" for all documents
  docPool = /* @__PURE__ */ new Map();
  // Client ID counter for Y.Doc instances
  nextClientId = Math.floor(Math.random() * 2147483647);
  async initialize(config) {
    this.storage = await this.createStorageAdapter(config);
    const signingKey = new Uint8Array(config.signingKey);
    this.store = new NodeStore({
      storage: this.storage,
      authorDID: config.authorDID,
      signingKey,
      // Signing already runs off the main thread here, but WebCrypto keeps
      // signature bursts (imports, transactions) from blocking the worker's
      // own event loop — queries and deltas stay responsive. Byte-identical
      // to the synchronous path; null when the runtime lacks SubtleCrypto.
      changeSigner: createWebCryptoChangeSigner(signingKey) ?? void 0
    });
    await this.store.initialize();
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.enqueueStoreChange(event);
      this.emitChangeFeedEvent(event);
    });
    this.storeBatchUnsubscribe = this.store.subscribeToBatchChanges((event) => {
      void this.handleStoreBatchChange(event);
    });
    this.setStatus("connected");
  }
  /**
   * Create the worker's storage adapter.
   *
   * With a forwarded `storagePort`, persistence goes through the existing
   * SQLite worker via PortSQLiteAdapter (worker-to-worker, no main-thread
   * hop). Without one, storage is in-memory.
   */
  async createStorageAdapter(config) {
    if (config.storagePort) {
      const portAdapter = new PortSQLiteAdapter(config.storagePort);
      await portAdapter.open();
      const storage = new SQLiteNodeStorageAdapter(portAdapter);
      await storage.open();
      return storage;
    }
    return new MemoryNodeStorageAdapter();
  }
  async subscribe(queryId, schemaId, options, onDelta) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    const descriptor = createQueryDescriptor(schemaId, options);
    const existing = this.subscriptions.get(queryId);
    const loaded = await this.loadQueryState(descriptor, existing?.lastResult ?? null);
    this.subscriptions.set(queryId, {
      schemaId,
      descriptor,
      options,
      lastResult: loaded.visible,
      workingSet: loaded.workingSet,
      onDelta: proxy(onDelta)
    });
    return this.toWireSnapshot(loaded.visible);
  }
  async unsubscribe(queryId) {
    this.subscriptions.delete(queryId);
  }
  async reloadQuery(queryId) {
    const sub = this.subscriptions.get(queryId);
    if (!sub) {
      return { encoding: "json", nodes: [] };
    }
    const loaded = await this.loadQueryState(sub.descriptor, sub.lastResult, sub.workingSet);
    sub.lastResult = loaded.visible;
    sub.workingSet = loaded.workingSet;
    return this.toWireSnapshot(loaded.visible);
  }
  /**
   * Encode a snapshot for the wire. Binary payloads ride a freshly
   * allocated buffer, so it is transferred (zero-copy) instead of cloned.
   */
  toWireSnapshot(nodes) {
    const snapshot = encodeWorkerQuerySnapshot(nodes);
    if (snapshot.encoding === "binary") {
      return transfer(snapshot, [snapshot.data.buffer]);
    }
    return snapshot;
  }
  async create(schemaId, data, id) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    return this.store.create({
      id,
      schemaId,
      properties: data
    });
  }
  async update(nodeId, changes) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    const revert = this.applyOptimisticNodeChange(nodeId, (node) => ({
      ...node,
      properties: { ...node.properties, ...changes },
      updatedAt: Date.now()
    }));
    try {
      return await this.store.update(nodeId, { properties: changes });
    } catch (err) {
      await revert();
      throw err;
    }
  }
  async delete(nodeId) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    const revert = this.applyOptimisticNodeChange(nodeId, (node) => ({
      ...node,
      deleted: true,
      updatedAt: Date.now()
    }));
    try {
      await this.store.delete(nodeId);
    } catch (err) {
      await revert();
      throw err;
    }
  }
  async restore(nodeId) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    return this.store.restore(nodeId);
  }
  async bulkWrite(input) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    return this.store.batchWrite(input);
  }
  async transaction(operations) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    const tx = await this.store.transaction(operations);
    return { batchId: tx.batchId, results: tx.results, tempIds: tx.tempIds };
  }
  async get(nodeId) {
    if (!this.store) {
      throw new Error("DataWorker not initialized");
    }
    return this.store.get(nodeId);
  }
  // ─── Document Operations ────────────────────────────────────────────────────
  async acquireDoc(nodeId, onUpdate) {
    if (!this.storage) {
      throw new Error("DataWorker not initialized");
    }
    const entry = await this.acquireDocEntry(nodeId);
    entry.updateHandlers.add(proxy(onUpdate));
    entry.refCount++;
    const state = Y.encodeStateAsUpdate(entry.doc);
    return transfer(
      {
        nodeId,
        state,
        clientId: this.nextClientId++
      },
      [state.buffer]
    );
  }
  async acquireDocEntry(nodeId) {
    const existing = this.docPool.get(nodeId);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing;
    }
    return this.createDocEntry(nodeId);
  }
  async createDocEntry(nodeId) {
    const doc = new Y.Doc({ guid: nodeId, gc: false });
    const storedContent = await this.storage.getDocumentContent(nodeId);
    if (storedContent && storedContent.length > 0) {
      Y.applyUpdate(doc, storedContent, "storage");
    }
    const entry = {
      doc,
      refCount: 0,
      updateHandlers: /* @__PURE__ */ new Set(),
      lastAccessed: Date.now()
    };
    this.evictOldDocs();
    doc.on("update", (update, origin) => {
      this.handleDocUpdate(nodeId, entry, update, origin);
    });
    this.docPool.set(nodeId, entry);
    return entry;
  }
  handleDocUpdate(nodeId, entry, update, origin) {
    this.persistDocState(nodeId, entry.doc);
    if (origin !== "remote") return;
    this.forwardRemoteDocUpdate(entry, update);
  }
  persistDocState(nodeId, doc) {
    const content = Y.encodeStateAsUpdate(doc);
    this.storage?.setDocumentContent(nodeId, content).catch((err) => {
      console.error("[DataWorker] Failed to persist doc:", err);
    });
  }
  forwardRemoteDocUpdate(entry, update) {
    const handlers = Array.from(entry.updateHandlers);
    for (let i = 0; i < handlers.length; i++) {
      try {
        this.sendDocUpdate(handlers[i], update, i === handlers.length - 1);
      } catch (err) {
        console.error("[DataWorker] Update handler error:", err);
      }
    }
  }
  sendDocUpdate(handler, update, isLast) {
    if (isLast && update.buffer.byteLength === update.byteLength) {
      handler(transfer(update, [update.buffer]), "remote");
      return;
    }
    handler(isLast ? update : new Uint8Array(update), "remote");
  }
  releaseDoc(nodeId) {
    const entry = this.docPool.get(nodeId);
    if (!entry) return;
    entry.refCount--;
  }
  applyLocalUpdate(nodeId, update) {
    const entry = this.docPool.get(nodeId);
    if (!entry) {
      console.warn("[DataWorker] applyLocalUpdate: doc not acquired:", nodeId);
      return;
    }
    Y.applyUpdate(entry.doc, update, "local");
  }
  // ─── Status ─────────────────────────────────────────────────────────────────
  getStatus() {
    return this.status;
  }
  onStatusChange(handler) {
    this.statusHandlers.add(proxy(handler));
  }
  /**
   * Subscribe to the worker's raw store change feed (devtools and other
   * instrumentation). Events are structured-clone-safe NodeChangeEvents.
   * The bridge registers a single forwarder and fans out locally, so the
   * worker keeps at most one handler per bridge.
   */
  subscribeToChanges(handler) {
    this.changeFeedHandlers.add(proxy(handler));
  }
  emitChangeFeedEvent(event) {
    for (const handler of this.changeFeedHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[DataWorker] Change feed handler error:", err);
      }
    }
  }
  async destroy() {
    this.detachStoreListeners();
    for (const entry of this.docPool.values()) {
      entry.doc.destroy();
    }
    this.docPool.clear();
    await this.closeStorage();
    this.store = null;
    this.subscriptions.clear();
    this.statusHandlers.clear();
    this.changeFeedHandlers.clear();
    this.setStatus("disconnected");
  }
  detachStoreListeners() {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.storeBatchUnsubscribe?.();
    this.storeBatchUnsubscribe = null;
  }
  async closeStorage() {
    if (this.storage?.close) {
      await this.storage.close();
    }
    this.storage = null;
  }
  // ─── Private Methods ─────────────────────────────────────────────────────────
  /**
   * Execute a subscription's query against storage. Bounded descriptors
   * overfetch a small buffer so later node changes can be applied in
   * memory, and re-queries graft previous node references back in wherever
   * the snapshots are equivalent (so reference-based delta math and
   * downstream identity caches keep working).
   */
  async loadQueryState(descriptor, previousNodes, previousWorkingSet) {
    if (!this.store) {
      return { visible: [], workingSet: null };
    }
    if (!queryDescriptorSupportsBoundedDelta(descriptor)) {
      const result2 = await this.store.query(descriptor);
      const merged2 = mergePreviousNodeReferences(result2.nodes, previousNodes, previousWorkingSet);
      return { visible: merged2, workingSet: null };
    }
    const result = await this.store.query(createBoundedWorkingSetDescriptor(descriptor));
    const merged = mergePreviousNodeReferences(result.nodes, previousNodes, previousWorkingSet);
    return {
      visible: merged.slice(0, descriptor.limit),
      workingSet: createBoundedWorkingSet(descriptor, merged)
    };
  }
  async reloadSubscription(sub) {
    const loaded = await this.loadQueryState(sub.descriptor, sub.lastResult, sub.workingSet);
    sub.lastResult = loaded.visible;
    sub.workingSet = loaded.workingSet;
    sub.onDelta({ type: "reload", data: loaded.visible });
  }
  enqueueStoreChange(event) {
    this.pendingStoreChanges.push(event);
    if (this.storeChangeFlushQueued) {
      return;
    }
    this.storeChangeFlushQueued = true;
    queueMicrotask(() => {
      void this.flushStoreChanges();
    });
  }
  async flushStoreChanges() {
    const events = this.pendingStoreChanges;
    this.pendingStoreChanges = [];
    this.storeChangeFlushQueued = false;
    if (events.length === 0) {
      return;
    }
    await this.handleStoreChangeSet(events);
  }
  isBulkStoreChangeSet(events) {
    return events.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD || events.some((event) => (event.change.batchSize ?? 1) > BULK_STORE_CHANGE_RELOAD_THRESHOLD);
  }
  *subscriptionsForSchema(schemaId) {
    for (const sub of this.subscriptions.values()) {
      if (sub.schemaId === schemaId) yield sub;
    }
  }
  async handleStoreChangeSet(events) {
    const eventsBySchema = groupNodeChangeEventsBySchema(events);
    for (const [schemaId, schemaEvents] of eventsBySchema) {
      const shouldReload = this.isBulkStoreChangeSet(schemaEvents);
      const changes = schemaEvents.map((event) => ({
        nodeId: event.change.payload.nodeId,
        nextNode: event.node ?? null
      }));
      for (const sub of this.subscriptionsForSchema(schemaId)) {
        if (shouldReload) {
          await this.reloadSubscription(sub);
          continue;
        }
        await this.applyChangesToSubscription(sub, changes);
      }
    }
  }
  /**
   * Batch notifications carry node ids only. Small batches hydrate the
   * touched nodes once and flow through the same delta path as regular
   * change events; only genuinely bulk batches re-query each subscription.
   */
  async handleStoreBatchChange(event) {
    if (event.nodeIds.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD) {
      await this.reloadSubscriptionsForSchemas(event.schemaIds);
      return;
    }
    try {
      await this.applyStoreBatchChangeDeltas(event);
    } catch (err) {
      console.error("[DataWorker] Failed to apply batch change deltas:", err);
      await this.reloadSubscriptionsForSchemas(event.schemaIds);
    }
  }
  async reloadSubscriptionsForSchemas(schemaIds) {
    for (const schemaId of schemaIds) {
      for (const sub of this.subscriptionsForSchema(schemaId)) {
        await this.reloadSubscription(sub);
      }
    }
  }
  async applyStoreBatchChangeDeltas(event) {
    if (!this.store) return;
    const nodes = await Promise.all(event.nodeIds.map((nodeId) => this.store.get(nodeId)));
    const changes = event.nodeIds.map((nodeId, index) => ({
      nodeId,
      nextNode: nodes[index]
    }));
    for (const schemaId of event.schemaIds) {
      for (const sub of this.subscriptionsForSchema(schemaId)) {
        await this.applyChangesToSubscription(sub, changes);
      }
    }
  }
  /**
   * Apply a list of node changes to one subscription, falling back to a
   * storage re-query only when a delta is ambiguous. Emits at most one
   * wire delta per change.
   */
  async applyChangesToSubscription(sub, changes, options) {
    const skipAmbiguous = options?.onAmbiguous === "skip";
    for (const change of changes) {
      const handled = await this.applyChangeAndEmit(sub, change, skipAmbiguous);
      if (!handled) return;
    }
  }
  /**
   * Apply one change to a subscription and emit its wire delta.
   * Returns false when the change was ambiguous (the subscription was
   * reloaded — or skipped — wholesale, so remaining changes are moot).
   */
  async applyChangeAndEmit(sub, change, skipAmbiguous) {
    const applied = this.applyChangeToSubscriptionState(sub, change.nodeId, change.nextNode);
    if (applied.kind === "reload") {
      if (!skipAmbiguous) {
        await this.reloadSubscription(sub);
      }
      return false;
    }
    if (applied.kind === "ok") {
      this.emitSubscriptionDelta(sub, applied);
    }
    return true;
  }
  emitSubscriptionDelta(sub, applied) {
    const delta = computeQueryDelta(sub.lastResult, applied.data);
    sub.lastResult = applied.data;
    sub.workingSet = applied.workingSet;
    if (delta) {
      sub.onDelta(delta);
    }
  }
  /**
   * Find the freshest cached snapshot of a node across all subscriptions.
   */
  findCachedNode(nodeId) {
    for (const sub of this.subscriptions.values()) {
      const fromWorkingSet = sub.workingSet?.nodes.find((node) => node.id === nodeId);
      if (fromWorkingSet) return fromWorkingSet;
      const fromData = sub.lastResult.find((node) => node.id === nodeId);
      if (fromData) return fromData;
    }
    return null;
  }
  /**
   * Synchronously apply an optimistic node mutation to every affected
   * subscription before persistence, so the main thread sees the edit one
   * postMessage later (~next microtask) instead of after storage commits.
   * Ambiguous deltas are skipped, not reloaded — storage still holds the
   * OLD state, and the durable change event that follows reconciles.
   * Returns a revert function that re-queries authoritative state (used
   * when persistence fails).
   */
  applyOptimisticNodeChange(nodeId, mutate) {
    const current = this.findCachedNode(nodeId);
    if (!current) {
      return async () => {
      };
    }
    const nextNode = mutate(current);
    const changes = [{ nodeId, nextNode }];
    for (const sub of this.subscriptions.values()) {
      if (sub.schemaId !== current.schemaId) continue;
      void this.applyChangesToSubscription(sub, changes, { onAmbiguous: "skip" });
    }
    return async () => {
      await this.reloadSubscriptionsForSchemas([current.schemaId]);
    };
  }
  applyChangeToSubscriptionState(sub, nodeId, nextNode) {
    if (sub.workingSet && queryDescriptorSupportsBoundedDelta(sub.descriptor)) {
      return this.applyBoundedChange(sub.descriptor, sub.workingSet, nodeId, nextNode);
    }
    return this.applyUnboundedChange(sub, nodeId, nextNode);
  }
  applyBoundedChange(descriptor, workingSet, nodeId, nextNode) {
    const delta = applyNodeChangeToBoundedQueryResult({ descriptor, workingSet, nodeId, nextNode });
    if (delta.kind !== "set") return { kind: delta.kind };
    return { kind: "ok", data: delta.data, workingSet: delta.workingSet };
  }
  applyUnboundedChange(sub, nodeId, nextNode) {
    const delta = applyNodeChangeToQueryResult({
      descriptor: sub.descriptor,
      currentData: sub.lastResult,
      nodeId,
      nextNode
    });
    if (delta.kind !== "set") return { kind: delta.kind };
    return { kind: "ok", data: delta.data, workingSet: null };
  }
  setStatus(status) {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
  /**
   * Evict unused Y.Docs from the pool to manage memory.
   * Only evicts docs with refCount=0 that haven't been accessed recently.
   */
  evictOldDocs() {
    if (this.docPool.size < MAX_DOC_POOL_SIZE) return;
    const candidates = this.collectDocEvictionCandidates();
    const targetSize = Math.floor(MAX_DOC_POOL_SIZE * 0.8);
    const toEvict = Math.min(this.docPool.size - targetSize, candidates.length);
    for (let i = 0; i < toEvict; i++) {
      this.evictDoc(candidates[i].nodeId);
    }
  }
  /**
   * Find eviction candidates — docs with no refs and old enough — ordered
   * oldest-accessed first.
   */
  collectDocEvictionCandidates() {
    const now = Date.now();
    const candidates = [];
    for (const [nodeId, entry] of this.docPool) {
      if (entry.refCount === 0 && now - entry.lastAccessed > MIN_DOC_AGE_FOR_EVICTION) {
        candidates.push({ nodeId, lastAccessed: entry.lastAccessed });
      }
    }
    return candidates.sort((a, b) => a.lastAccessed - b.lastAccessed);
  }
  evictDoc(nodeId) {
    const entry = this.docPool.get(nodeId);
    if (!entry) return;
    if (this.storage) {
      const content = Y.encodeStateAsUpdate(entry.doc);
      this.storage.setDocumentContent(nodeId, content).catch(() => {
      });
    }
    entry.doc.destroy();
    this.docPool.delete(nodeId);
  }
};

// src/worker/data-worker.ts
expose(new DataWorker());
export {
  DataWorker
};
