/**
 * Shared CanvasView core (exploration 0277 / 0230 Phase 5).
 *
 * The web and desktop CanvasViews are deliberate forks for shell chrome
 * only; everything canvas-capable converges here. Platform shells inject
 * navigation, chrome, and command transport.
 */

export { CANVAS_DASHBOARD_SCHEMA_REGISTRY } from './dashboard-schemas.js'
export { CanvasWidgetNodeCard, type CanvasWidgetNodeCardProps } from './CanvasWidgetNodeCard.js'
