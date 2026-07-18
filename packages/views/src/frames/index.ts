/**
 * Frames sub-barrel (0346) — the Frame contract, its renderer/registry,
 * container adapters, and the dashboard frame widget.
 */

export { FRAME_MAX_DEPTH, type FrameDef, type FrameSource, type FrameTier } from './types.js'
export {
  FrameSourceRegistry,
  frameSourceRegistry,
  type FrameSourceRenderer,
  type NodeFrameProps
} from './registry.js'
export {
  FrameHostProvider,
  FrameRenderer,
  SealedFrame,
  useFrameDepth,
  useFrameHost,
  type FrameHost,
  type FrameRendererProps
} from './FrameRenderer.js'
export { frameFromCanvasNode, frameFromDatabaseEmbed, frameFromPageEmbed } from './adapters.js'
export {
  FRAME_WIDGET_TYPE,
  createFrameWidgetDefinition,
  parseCollectionIds,
  registerFrameWidget,
  type FrameWidgetConfig
} from './frame-widget.js'
