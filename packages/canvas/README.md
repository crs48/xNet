# @xnet/canvas

Infinite canvas for spatial visualization of xNet documents.

## Overview

Provides graph-like visualization:

- **Spatial indexing** with R-tree (rbush)
- **Auto-layout** with ELK.js
- **Pan/zoom** with smooth performance
- **Node rendering** for documents and databases

## Status

**Not yet implemented** - This is a scaffold package.

## Planned Structure

```
src/
  spatial/    # R-tree indexing with rbush
  layout/     # ELK.js graph layout
  renderer/   # Canvas rendering
  nodes/      # Node type components
  edges/      # Connection rendering
```

## Dependencies

- rbush - Spatial indexing
- elkjs - Graph layout algorithms
- @xnet/database - Document/item data

## Installation

```bash
pnpm add @xnet/canvas
```

## Testing

```bash
pnpm test
```
