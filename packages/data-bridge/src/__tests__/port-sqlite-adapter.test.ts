/**
 * Tests for PortSQLiteAdapter (0164 storage forwarding).
 *
 * Drives the adapter over a real MessageChannel with a mock
 * SQLiteWorkerHandler exposed on the far end — the same wire protocol the
 * SQLite worker exposes via `connectPort()`.
 */

import { expose } from 'comlink'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PortSQLiteAdapter } from '../worker/port-sqlite-adapter'

function createMockHandler() {
  return {
    isOpen: vi.fn(async () => true),
    query: vi.fn(async (_sql: string, _params?: unknown[]) => [{ id: 'row-1' }]),
    queryOne: vi.fn(async () => ({ id: 'row-1' })),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowid: 1 })),
    exec: vi.fn(async () => {}),
    transaction: vi.fn(async (_ops: Array<{ sql: string; params?: unknown[] }>) => {}),
    applyNodeBatch: vi.fn(async () => ({ nodesWritten: 1 })),
    getSchemaVersion: vi.fn(async () => 7),
    getDatabaseSize: vi.fn(async () => 1024),
    vacuum: vi.fn(async () => {}),
    getStorageMode: vi.fn(async () => 'opfs' as const)
  }
}

describe('PortSQLiteAdapter', () => {
  let handler: ReturnType<typeof createMockHandler>
  let channel: MessageChannel
  let adapter: PortSQLiteAdapter

  beforeEach(() => {
    handler = createMockHandler()
    channel = new MessageChannel()
    expose(handler, channel.port1)
    adapter = new PortSQLiteAdapter(channel.port2)
  })

  afterEach(async () => {
    await adapter.close()
    channel.port1.close()
  })

  it('verifies the remote database is open instead of re-opening it', async () => {
    await adapter.open()
    expect(handler.isOpen).toHaveBeenCalled()
    expect(adapter.isOpen()).toBe(true)
  })

  it('rejects open() when the remote database is closed', async () => {
    handler.isOpen.mockResolvedValueOnce(false)
    await expect(adapter.open()).rejects.toThrow('database not open on the SQLite worker')
  })

  it('forwards queries, runs, and node batches over the port', async () => {
    const rows = await adapter.query('SELECT * FROM nodes WHERE id = ?', ['row-1'])
    expect(rows).toEqual([{ id: 'row-1' }])
    expect(handler.query).toHaveBeenCalledWith('SELECT * FROM nodes WHERE id = ?', ['row-1'])

    const result = await adapter.run('DELETE FROM nodes WHERE id = ?', ['row-1'])
    expect(result.changes).toBe(1)

    await adapter.applyNodeBatch({ nodes: [] } as never)
    expect(handler.applyNodeBatch).toHaveBeenCalled()
  })

  it('maps transactionBatch onto the worker transaction protocol', async () => {
    const ops = [{ sql: 'INSERT INTO nodes VALUES (?)', params: ['a'] }]
    await adapter.transactionBatch(ops)
    expect(handler.transaction).toHaveBeenCalledWith(ops)
  })

  it('rejects callback transactions and prepared statements', async () => {
    await expect(adapter.transaction(async () => {})).rejects.toThrow('not supported over a port')
    await expect(adapter.prepare('SELECT 1')).rejects.toThrow('not supported over a port')
  })

  it('manages manual transaction state locally', async () => {
    await adapter.beginTransaction()
    await expect(adapter.beginTransaction()).rejects.toThrow('already in progress')
    await adapter.commit()
    await expect(adapter.commit()).rejects.toThrow('No transaction in progress')
    // rollback with no transaction is a no-op
    await adapter.rollback()
    expect(handler.exec).toHaveBeenCalledWith('BEGIN IMMEDIATE')
    expect(handler.exec).toHaveBeenCalledWith('COMMIT')
  })

  it('throws on use after close', async () => {
    await adapter.close()
    expect(adapter.isOpen()).toBe(false)
    await expect(adapter.query('SELECT 1')).rejects.toThrow('Database not open')
  })
})
