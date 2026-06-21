import Foundation

/// A reactive query — the Swift analogue of `liveQuery()`
/// (packages/runtime/src/live-query.ts). `subscribe(_:)` fires immediately with
/// the current rows and again on every store change, and returns a `Cancellable`
/// that detaches the underlying store subscription when the last subscriber goes.
public final class LiveQuery {
    private let store: NodeStore
    private let query: Query
    private var storeSub: Cancellable?
    private var runs: [UUID: ([NodeState]) -> Void] = [:]

    public init(_ store: NodeStore, _ query: Query) {
        self.store = store
        self.query = query
    }

    /// Read the current rows synchronously.
    public func current() -> [NodeState] { store.query(query) }

    /// Subscribe. `run` is called immediately and on every change. Returns a
    /// `Cancellable`; the shared store subscription is torn down when the last
    /// subscriber unsubscribes.
    @discardableResult
    public func subscribe(_ run: @escaping ([NodeState]) -> Void) -> Cancellable {
        let id = UUID()
        runs[id] = run
        ensureStoreSubscription()
        run(store.query(query))  // fire immediately with the current value
        return Cancellable { [weak self] in
            guard let self else { return }
            self.runs.removeValue(forKey: id)
            if self.runs.isEmpty {
                self.storeSub?.cancel()
                self.storeSub = nil
            }
        }
    }

    private func ensureStoreSubscription() {
        guard storeSub == nil else { return }
        storeSub = store.subscribe { [weak self] in
            guard let self else { return }
            let rows = self.store.query(self.query)
            for run in self.runs.values { run(rows) }
        }
    }
}

#if canImport(Observation)
import Observation

/// An `@Observable` model that drives a SwiftUI re-render loop — the native
/// analogue of React's `useQuery`. A SwiftUI `View` reads `model.rows` and
/// re-renders automatically whenever the query result changes, with no hook
/// ceremony:
///
/// ```swift
/// struct TaskListView: View {
///     @State private var model: LiveQueryModel
///     var body: some View {
///         List(model.rows) { node in Text(node["title"]?.stringValue ?? "") }
///     }
/// }
/// ```
@available(macOS 14, iOS 17, visionOS 1, *)
@MainActor
@Observable
public final class LiveQueryModel {
    public private(set) var rows: [NodeState] = []
    @ObservationIgnored private var cancellable: Cancellable?
    @ObservationIgnored private let live: LiveQuery

    public init(_ store: NodeStore, _ query: Query) {
        self.live = LiveQuery(store, query)
        // Delivery is synchronous and, in supported single-threaded usage,
        // already on the main actor; assert that invariant rather than hop
        // (which would add latency). An actor-based store is the follow-up.
        self.cancellable = live.subscribe { [weak self] rows in
            MainActor.assumeIsolated { self?.rows = rows }
        }
    }
}
#endif
