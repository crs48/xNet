/**
 * Tagged errors (exploration 0303).
 *
 * The repo-wide convention for structured errors, formalizing what
 * `NodeRelayError.code` and friends already did by hand: every structured
 * error carries a string-literal `_tag` discriminant so catch sites can
 * narrow exhaustively instead of sniffing `instanceof` chains or message
 * strings. Deliberately shaped like Effect's `Data.TaggedError` so a later
 * migration would be mechanical.
 *
 * Convention (see CLAUDE.md): new structured errors extend `TaggedError`,
 * set `_tag` to the class name, and put machine-readable context in readonly
 * fields (a `code` union where one error class spans several failure kinds).
 * Existing error classes migrate on touch, not as a campaign.
 */

export abstract class TaggedError<Tag extends string = string> extends Error {
  /** String-literal discriminant — by convention the class name. */
  abstract readonly _tag: Tag

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

/** Narrow an unknown catch value to a specific tagged error. */
export function isTagged<Tag extends string>(error: unknown, tag: Tag): error is TaggedError<Tag> {
  return error instanceof TaggedError && error._tag === tag
}
