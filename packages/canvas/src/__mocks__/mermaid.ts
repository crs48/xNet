/**
 * Mock Mermaid Module
 *
 * Used for testing the MermaidNodeComponent without requiring the
 * actual mermaid library to be installed.
 */

import { vi } from 'vitest'

interface MockMermaid {
  initialize: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

const mockMermaid: MockMermaid = {
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({ svg: '<svg>mock diagram</svg>' })
}

export default mockMermaid
