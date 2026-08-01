/**
 * Labs — the registry behind Settings › Labs (exploration 0282).
 *
 * Labs is now a *view* of the capability register (0428) rather than its own
 * list: entries live in `capabilities.ts`, and the ones carrying a `labs`
 * surface render here as honest toggles — the Obsidian-core-plugins pattern,
 * not the chrome://flags incantation. Flag KEY constants stay where their
 * features live (`@xnetjs/workbench`); neither file owns them.
 *
 * Named "Labs" and not "Experiments" — the habit tracker owns that word
 * (`/experiments`, ExperimentsView).
 */
import { LABS_CAPABILITIES, type Capability } from './capabilities'

export type LabsFlag = Capability

export const LABS_FLAGS: LabsFlag[] = LABS_CAPABILITIES

export { isLabEnabled, setLabEnabled } from './capabilities'
