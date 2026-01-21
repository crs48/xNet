/**
 * App-level type definitions
 */

export interface Document {
  id: string
  title: string
  type: 'page' | 'database' | 'canvas'
  icon?: string
  createdAt?: number
  updatedAt?: number
}

export interface AppState {
  identity: string | null
  documents: Document[]
  isLoading: boolean
  error: string | null
}
