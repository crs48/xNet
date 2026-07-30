/**
 * @xnetjs/hub — durable form-inbox store (its own `forms.db`).
 *
 * Public form submissions (exploration 0278) follow the webhook-inbox trust
 * model: the hub is a durable quarantine, not a writer. Tokens are minted by
 * an authenticated owner and stored HASHED (share-secret discipline — a hub
 * database dump must not yield working submission URLs); anonymous
 * respondents authenticate with the raw token in the URL path. Submissions
 * sit in this store until an owner client drains them into signed
 * DatabaseRow nodes and acks, or marks them rejected for human review.
 *
 * Subsystem-local database (billing-store pattern) rather than bloating the
 * core `HubStorage`; memory mode backs tests and demo hubs.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

/**
 * The sanitized, respondent-facing form definition. Published by the owner's
 * client when minting/refreshing a link — the hub never derives it from
 * workspace data (it may not be able to: E2E spaces), it only serves the
 * snapshot back. Kept structural (`questions: unknown[]`) because the hub is
 * deliberately content-dumb about schemas.
 */
export interface PublicFormDefinition {
  title?: string
  description?: string
  questions: unknown[]
  rules?: Record<string, unknown>
  submitLabel?: string
  confirmation?: { title?: string; body?: string }
}

export interface FormTokenRecord {
  /** SHA-256 of the raw token, base64url — the primary key. */
  tokenHash: string
  /** The form DatabaseView node id. */
  viewId: string
  /** The parent Database node id. */
  databaseId: string
  /** Space id (cascade boundary) the drain client writes rows into. */
  space: string
  createdByDid: string
  label: string | null
  definition: PublicFormDefinition
  /** Owner toggle: the form page shows "closed" when false. */
  accepting: boolean
  /** Revocation: disabled tokens 404 like unknown ones. */
  disabled: boolean
  /** Epoch ms; 0 = never expires. */
  expiresAt: number
  createdAt: number
  updatedAt: number
}

export type FormSubmissionStatus = 'pending' | 'rejected'

export interface FormSubmissionRecord {
  tokenHash: string
  /** Client-generated idempotency key; (tokenHash, nonce) is unique. */
  nonce: string
  answers: Record<string, unknown>
  receivedAt: number
  status: FormSubmissionStatus
  /** Drain-time validation errors, for the rejected-review list. */
  rejectionReasons: string[] | null
}

export interface FormTokenPatch {
  label?: string | null
  definition?: PublicFormDefinition
  accepting?: boolean
  disabled?: boolean
  expiresAt?: number
}

export interface FormInboxStore {
  insertToken(record: FormTokenRecord): Promise<void>
  getToken(tokenHash: string): Promise<FormTokenRecord | null>
  listTokensByCreator(did: string): Promise<FormTokenRecord[]>
  listTokensByView(viewId: string): Promise<FormTokenRecord[]>
  updateToken(tokenHash: string, patch: FormTokenPatch): Promise<void>
  deleteToken(tokenHash: string): Promise<void>
  /** Idempotent: returns false when (tokenHash, nonce) already exists. */
  insertSubmission(record: FormSubmissionRecord): Promise<boolean>
  listSubmissions(tokenHash: string, status?: FormSubmissionStatus): Promise<FormSubmissionRecord[]>
  setSubmissionStatus(
    tokenHash: string,
    nonce: string,
    status: FormSubmissionStatus,
    reasons?: string[]
  ): Promise<void>
  deleteSubmission(tokenHash: string, nonce: string): Promise<void>
  countSubmissions(tokenHash: string, status: FormSubmissionStatus): Promise<number>
}

// ─── SQLite ──────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS form_tokens (
  token_hash TEXT PRIMARY KEY,
  view_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  space TEXT NOT NULL,
  created_by_did TEXT NOT NULL,
  label TEXT,
  definition TEXT NOT NULL,
  accepting INTEGER NOT NULL DEFAULT 1,
  disabled INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_form_tokens_creator ON form_tokens(created_by_did);
CREATE INDEX IF NOT EXISTS idx_form_tokens_view ON form_tokens(view_id);

CREATE TABLE IF NOT EXISTS form_submissions (
  token_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  answers TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reasons TEXT,
  PRIMARY KEY (token_hash, nonce)
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(token_hash, status);
`

type Row = Record<string, unknown>

const tokenFromRow = (row: Row): FormTokenRecord => ({
  tokenHash: row.token_hash as string,
  viewId: row.view_id as string,
  databaseId: row.database_id as string,
  space: row.space as string,
  createdByDid: row.created_by_did as string,
  label: (row.label as string | null) ?? null,
  definition: JSON.parse(row.definition as string) as PublicFormDefinition,
  accepting: Boolean(row.accepting),
  disabled: Boolean(row.disabled),
  expiresAt: row.expires_at as number,
  createdAt: row.created_at as number,
  updatedAt: row.updated_at as number
})

const submissionFromRow = (row: Row): FormSubmissionRecord => ({
  tokenHash: row.token_hash as string,
  nonce: row.nonce as string,
  answers: JSON.parse(row.answers as string) as Record<string, unknown>,
  receivedAt: row.received_at as number,
  status: row.status as FormSubmissionStatus,
  rejectionReasons: row.rejection_reasons
    ? (JSON.parse(row.rejection_reasons as string) as string[])
    : null
})

export class SqliteFormInboxStore implements FormInboxStore {
  private readonly db: Database.Database

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'forms.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA_SQL)
  }

  async insertToken(record: FormTokenRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO form_tokens
         (token_hash, view_id, database_id, space, created_by_did, label, definition,
          accepting, disabled, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.tokenHash,
        record.viewId,
        record.databaseId,
        record.space,
        record.createdByDid,
        record.label,
        JSON.stringify(record.definition),
        record.accepting ? 1 : 0,
        record.disabled ? 1 : 0,
        record.expiresAt,
        record.createdAt,
        record.updatedAt
      )
  }

  async getToken(tokenHash: string): Promise<FormTokenRecord | null> {
    const row = this.db.prepare('SELECT * FROM form_tokens WHERE token_hash = ?').get(tokenHash) as
      | Row
      | undefined
    return row ? tokenFromRow(row) : null
  }

  async listTokensByCreator(did: string): Promise<FormTokenRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM form_tokens WHERE created_by_did = ? ORDER BY created_at DESC')
      .all(did) as Row[]
    return rows.map(tokenFromRow)
  }

  async listTokensByView(viewId: string): Promise<FormTokenRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM form_tokens WHERE view_id = ? ORDER BY created_at DESC')
      .all(viewId) as Row[]
    return rows.map(tokenFromRow)
  }

  async updateToken(tokenHash: string, patch: FormTokenPatch): Promise<void> {
    const current = await this.getToken(tokenHash)
    if (!current) return
    const next = { ...current, ...patch, updatedAt: Date.now() }
    this.db
      .prepare(
        `UPDATE form_tokens SET label = ?, definition = ?, accepting = ?, disabled = ?,
         expires_at = ?, updated_at = ? WHERE token_hash = ?`
      )
      .run(
        next.label,
        JSON.stringify(next.definition),
        next.accepting ? 1 : 0,
        next.disabled ? 1 : 0,
        next.expiresAt,
        next.updatedAt,
        tokenHash
      )
  }

  async deleteToken(tokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM form_submissions WHERE token_hash = ?').run(tokenHash)
    this.db.prepare('DELETE FROM form_tokens WHERE token_hash = ?').run(tokenHash)
  }

  async insertSubmission(record: FormSubmissionRecord): Promise<boolean> {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO form_submissions
         (token_hash, nonce, answers, received_at, status, rejection_reasons)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.tokenHash,
        record.nonce,
        JSON.stringify(record.answers),
        record.receivedAt,
        record.status,
        record.rejectionReasons ? JSON.stringify(record.rejectionReasons) : null
      )
    return result.changes > 0
  }

  async listSubmissions(
    tokenHash: string,
    status?: FormSubmissionStatus
  ): Promise<FormSubmissionRecord[]> {
    const rows = (
      status
        ? this.db
            .prepare(
              'SELECT * FROM form_submissions WHERE token_hash = ? AND status = ? ORDER BY received_at ASC'
            )
            .all(tokenHash, status)
        : this.db
            .prepare('SELECT * FROM form_submissions WHERE token_hash = ? ORDER BY received_at ASC')
            .all(tokenHash)
    ) as Row[]
    return rows.map(submissionFromRow)
  }

  async setSubmissionStatus(
    tokenHash: string,
    nonce: string,
    status: FormSubmissionStatus,
    reasons?: string[]
  ): Promise<void> {
    this.db
      .prepare(
        'UPDATE form_submissions SET status = ?, rejection_reasons = ? WHERE token_hash = ? AND nonce = ?'
      )
      .run(status, reasons ? JSON.stringify(reasons) : null, tokenHash, nonce)
  }

  async deleteSubmission(tokenHash: string, nonce: string): Promise<void> {
    this.db
      .prepare('DELETE FROM form_submissions WHERE token_hash = ? AND nonce = ?')
      .run(tokenHash, nonce)
  }

  async countSubmissions(tokenHash: string, status: FormSubmissionStatus): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM form_submissions WHERE token_hash = ? AND status = ?')
      .get(tokenHash, status) as { n: number }
    return row.n
  }
}

// ─── Memory (tests / demo hubs) ──────────────────────────────────────────────

export class MemoryFormInboxStore implements FormInboxStore {
  private tokens = new Map<string, FormTokenRecord>()
  private submissions = new Map<string, FormSubmissionRecord>()

  private subKey(tokenHash: string, nonce: string): string {
    return `${tokenHash} ${nonce}`
  }

  async insertToken(record: FormTokenRecord): Promise<void> {
    this.tokens.set(record.tokenHash, { ...record })
  }

  async getToken(tokenHash: string): Promise<FormTokenRecord | null> {
    const record = this.tokens.get(tokenHash)
    return record ? { ...record } : null
  }

  async listTokensByCreator(did: string): Promise<FormTokenRecord[]> {
    return [...this.tokens.values()]
      .filter((t) => t.createdByDid === did)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async listTokensByView(viewId: string): Promise<FormTokenRecord[]> {
    return [...this.tokens.values()]
      .filter((t) => t.viewId === viewId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateToken(tokenHash: string, patch: FormTokenPatch): Promise<void> {
    const current = this.tokens.get(tokenHash)
    if (!current) return
    this.tokens.set(tokenHash, { ...current, ...patch, updatedAt: Date.now() })
  }

  async deleteToken(tokenHash: string): Promise<void> {
    this.tokens.delete(tokenHash)
    for (const key of [...this.submissions.keys()]) {
      if (key.startsWith(`${tokenHash} `)) this.submissions.delete(key)
    }
  }

  async insertSubmission(record: FormSubmissionRecord): Promise<boolean> {
    const key = this.subKey(record.tokenHash, record.nonce)
    if (this.submissions.has(key)) return false
    this.submissions.set(key, { ...record })
    return true
  }

  async listSubmissions(
    tokenHash: string,
    status?: FormSubmissionStatus
  ): Promise<FormSubmissionRecord[]> {
    return [...this.submissions.values()]
      .filter((s) => s.tokenHash === tokenHash && (!status || s.status === status))
      .sort((a, b) => a.receivedAt - b.receivedAt)
  }

  async setSubmissionStatus(
    tokenHash: string,
    nonce: string,
    status: FormSubmissionStatus,
    reasons?: string[]
  ): Promise<void> {
    const key = this.subKey(tokenHash, nonce)
    const current = this.submissions.get(key)
    if (!current) return
    this.submissions.set(key, { ...current, status, rejectionReasons: reasons ?? null })
  }

  async deleteSubmission(tokenHash: string, nonce: string): Promise<void> {
    this.submissions.delete(this.subKey(tokenHash, nonce))
  }

  async countSubmissions(tokenHash: string, status: FormSubmissionStatus): Promise<number> {
    return (await this.listSubmissions(tokenHash, status)).length
  }
}

export function createFormInboxStore(opts: {
  storage: 'sqlite' | 'memory'
  dataDir: string
}): FormInboxStore {
  return opts.storage === 'memory'
    ? new MemoryFormInboxStore()
    : new SqliteFormInboxStore(opts.dataDir)
}
