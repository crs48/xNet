/**
 * Coachmarks — light, extensible first-run tips (exploration 0206).
 *
 * Public surface: mount {@link CoachmarkLayer} in the shell, register tips
 * with {@link contributeTips}, and call {@link resetCoachSession} when the
 * user replays onboarding from Settings.
 */
export { CoachmarkLayer } from './CoachmarkLayer'
export { Coachmark, type CoachmarkProps } from './Coachmark'
export {
  contributeTips,
  tipsForView,
  selectUnseenTips,
  type CoachTip,
  type CoachTipId
} from './registry'
export { useCoachmarks, resetCoachSession, type CoachmarksApi } from './useCoachmarks'
export { viewIdForPath } from './views'
