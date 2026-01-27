/**
 * @xnet/plugins - Plugin system for extending xNet
 *
 * Provides infrastructure for:
 * - Plugin registration and lifecycle management
 * - Extension points (views, commands, editor extensions, etc.)
 * - NodeStore middleware for pre/post change hooks
 * - Plugin storage as Nodes for P2P sync
 */

// Core types
export type {
  Disposable,
  Platform,
  PluginPermissions,
  PlatformCapabilities,
  ExtensionStorage
} from './types'
export { getPlatformCapabilities, createExtensionStorage } from './types'

// Manifest
export type { XNetExtension, PluginContributions } from './manifest'
export { validateManifest, defineExtension, PluginValidationError } from './manifest'

// Contributions
export type {
  ViewContribution,
  ViewProps,
  CommandContribution,
  SlashCommandContribution,
  SlashCommandContext,
  EditorContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  PropertyHandler,
  PropertyCellProps,
  PropertyEditorProps,
  BlockContribution,
  BlockProps,
  SettingContribution,
  SchemaContribution
} from './contributions'
export { TypedRegistry, ContributionRegistry } from './contributions'

// Middleware
export type { PendingChange, NodeChangeEvent, NodeStoreMiddleware } from './middleware'
export { MiddlewareChain } from './middleware'

// Context
export type {
  ExtensionContext,
  PluginNodeChangeEvent,
  PluginNodeChangeListener,
  QueryFilter
} from './context'
export { createExtensionContext } from './context'

// Registry
export type { PluginStatus, RegisteredPlugin } from './registry'
export { PluginRegistry, PluginError } from './registry'

// Schemas
export { PluginSchema } from './schemas/plugin'
export type { PluginNode } from './schemas/plugin'
