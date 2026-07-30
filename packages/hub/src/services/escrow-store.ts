/**
 * @xnetjs/hub - Recovery-anchor escrow store (explorations 0243/0322/0338).
 *
 * Holds the PIN-sealed, serialized escrow envelope keyed by xNet DID, plus the
 * anchor (kind + external subject) allowed to release it. The hub can NEVER
 * open the blob — release only hands the sealed bytes back after the anchor
 * verifies the ceremony; the user's PIN is the second factor, applied
 * client-side. In-memory by default (mirrors RevocationService); a
 * durable-storage backing can implement the same interface later.
 */

export interface EscrowRecord {
  xnetDid: string
  anchorKind: string
  anchorSubject: string
  /** base64url of the serialized, PIN-sealed escrow envelope. */
  sealedEscrowB64: string
  enrolledAt: number
}

export class EscrowStore {
  private records = new Map<string, EscrowRecord>()

  enroll(record: EscrowRecord): void {
    this.records.set(record.xnetDid, record)
  }

  get(xnetDid: string): EscrowRecord | null {
    return this.records.get(xnetDid) ?? null
  }

  remove(xnetDid: string): void {
    this.records.delete(xnetDid)
  }

  get size(): number {
    return this.records.size
  }
}
