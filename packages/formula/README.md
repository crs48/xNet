# @xnet/formula

Formula parser and evaluator for database computed properties.

## Overview

Provides a formula language similar to Notion/Excel:

- Expression parsing (lexer + parser)
- AST evaluation
- Built-in functions (math, string, date, logic)
- Property references

## Status

**Not yet implemented** - This is a scaffold package. Implementation will include:

- `src/lexer.ts` - Tokenization
- `src/parser.ts` - AST generation
- `src/evaluator.ts` - Expression evaluation
- `src/functions/` - Built-in function library

## Planned Features

```typescript
// Example formulas (not yet working)
"prop(\"Price\") * prop(\"Quantity\")"
"if(prop(\"Status\") == \"Done\", \"Complete\", \"Pending\")"
"formatDate(prop(\"Due Date\"), \"MMM D, YYYY\")"
"sum(prop(\"Subtasks\").map(t => t.prop(\"Hours\")))"
```

## Installation

```bash
pnpm add @xnet/formula
```

## Testing

```bash
pnpm test
```
