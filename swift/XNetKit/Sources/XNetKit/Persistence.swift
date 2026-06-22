import Foundation
import SQLite3

/// A durable change log. The store persists every applied change here and
/// replays them on open, so node state survives app restarts.
public protocol ChangeLogStore: AnyObject {
    /// All persisted changes, ascending by lamport (replay order).
    func load() -> [Change]
    /// Append a change (idempotent by hash).
    func append(_ change: Change)
}

// SQLite wants to copy bound text/blob (the Swift String is transient).
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// A `ChangeLogStore` backed by SQLite (the system library — no extra package).
/// Stores the signed change log as JSON; the materialized node state is rebuilt
/// by replaying it through the store's LWW fold on open.
public final class SQLiteChangeLog: ChangeLogStore {
    private var db: OpaquePointer?

    /// Open (or create) a database at `path` (use `":memory:"` for ephemeral).
    public init(path: String) {
        sqlite3_open(path, &db)
        exec(
            """
            CREATE TABLE IF NOT EXISTS changes (
              hash TEXT PRIMARY KEY,
              node_id TEXT NOT NULL,
              lamport INTEGER NOT NULL,
              data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_changes_node ON changes(node_id);
            """
        )
    }

    public func load() -> [Change] {
        var out: [Change] = []
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "SELECT data FROM changes ORDER BY lamport ASC, hash ASC", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                guard let cstr = sqlite3_column_text(stmt, 0) else { continue }
                let json = String(cString: cstr)
                if let obj = try? JSONSerialization.jsonObject(with: Data(json.utf8)),
                   let dict = obj as? [String: Any],
                   let change = WireCodec.deserialize(dict) {
                    out.append(change)
                }
            }
        }
        sqlite3_finalize(stmt)
        return out
    }

    public func append(_ change: Change) {
        let dict = WireCodec.serialize(change, room: "")
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8) else { return }
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(
            db, "INSERT OR IGNORE INTO changes (hash, node_id, lamport, data) VALUES (?,?,?,?)",
            -1, &stmt, nil
        ) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, change.hash, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, change.payload.nodeId, -1, SQLITE_TRANSIENT)
            sqlite3_bind_int64(stmt, 3, change.lamport)
            sqlite3_bind_text(stmt, 4, json, -1, SQLITE_TRANSIENT)
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)
    }

    public func close() {
        if db != nil { sqlite3_close(db); db = nil }
    }

    private func exec(_ sql: String) { sqlite3_exec(db, sql, nil, nil, nil) }

    deinit { close() }
}
