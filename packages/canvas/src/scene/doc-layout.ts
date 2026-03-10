import * as Y from 'yjs'

export const CANVAS_OBJECTS_MAP_KEY = 'objects'
export const CANVAS_CONNECTORS_MAP_KEY = 'connectors'
export const CANVAS_GROUPS_MAP_KEY = 'groups'
export const CANVAS_METADATA_MAP_KEY = 'metadata'

export type CanvasDocMaps = {
  objects: Y.Map<unknown>
  connectors: Y.Map<unknown>
  groups: Y.Map<unknown>
  metadata: Y.Map<unknown>
}

export function getCanvasObjectsMap<T = unknown>(doc: Y.Doc): Y.Map<T> {
  return doc.getMap<T>(CANVAS_OBJECTS_MAP_KEY)
}

export function getCanvasConnectorsMap<T = unknown>(doc: Y.Doc): Y.Map<T> {
  return doc.getMap<T>(CANVAS_CONNECTORS_MAP_KEY)
}

export function getCanvasGroupsMap<T = unknown>(doc: Y.Doc): Y.Map<T> {
  return doc.getMap<T>(CANVAS_GROUPS_MAP_KEY)
}

export function getCanvasMetadataMap<T = unknown>(doc: Y.Doc): Y.Map<T> {
  return doc.getMap<T>(CANVAS_METADATA_MAP_KEY)
}

export function ensureCanvasDocMaps(doc: Y.Doc): CanvasDocMaps {
  return {
    objects: getCanvasObjectsMap(doc),
    connectors: getCanvasConnectorsMap(doc),
    groups: getCanvasGroupsMap(doc),
    metadata: getCanvasMetadataMap(doc)
  }
}
