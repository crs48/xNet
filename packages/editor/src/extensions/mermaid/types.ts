/**
 * Types for the Mermaid diagram extension
 */

export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral'

export interface MermaidConfig {
  theme: MermaidTheme
  securityLevel: 'loose' | 'strict' | 'antiscript' | 'sandbox'
}

export const DEFAULT_MERMAID_CONFIG: MermaidConfig = {
  theme: 'default',
  // Use 'loose' instead of 'sandbox' - sandbox uses iframes with data URLs
  // which Electron blocks. 'loose' renders SVG directly.
  securityLevel: 'loose'
}

export const MERMAID_EXAMPLES: Record<string, string> = {
  flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do something]
    B -->|No| D[Do something else]
    C --> E[End]
    D --> E`,
  sequence: `sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hi Alice!
    Alice->>Bob: How are you?
    Bob-->>Alice: Great!`,
  classDiagram: `classDiagram
    class Animal {
        +name: string
        +age: int
        +makeSound()
    }
    class Dog {
        +breed: string
        +bark()
    }
    Animal <|-- Dog`,
  stateDiagram: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Complete: Done
    Processing --> Error: Fail
    Complete --> [*]
    Error --> Idle: Retry`,
  erDiagram: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : includes`,
  gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
    Research    :a1, 2024-01-01, 7d
    Design      :a2, after a1, 5d
    section Development
    Implementation :a3, after a2, 14d
    Testing        :a4, after a3, 7d`,
  pie: `pie title Distribution
    "Category A" : 40
    "Category B" : 30
    "Category C" : 20
    "Category D" : 10`,
  mindmap: `mindmap
  root((Central Idea))
    Topic 1
      Subtopic A
      Subtopic B
    Topic 2
      Subtopic C
    Topic 3`
}
