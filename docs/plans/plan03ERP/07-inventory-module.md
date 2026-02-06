# 07: Inventory Module

> Product catalog, warehouse management, and stock tracking

**Package:** `modules/@xnet/inventory`
**Dependencies:** `@xnet/modules`, `@xnet/workflows`, `@xnet/dashboard`, `@xnet/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - Inventory entities (Product, Warehouse, StockMovement) defined as Schemas
> - All inventory data stored as Nodes in NodeStore

## Goals

- Complete product catalog with variants
- Multi-warehouse inventory tracking
- Stock movements and transfers
- Low stock alerts and reorder workflows
- Barcode/QR code support

## Module Definition

```typescript
// modules/inventory/src/module.ts

import { ModuleDefinition } from '@xnet/modules'

export const InventoryModule: ModuleDefinition = {
  id: 'mod:inventory',
  name: 'Inventory',
  version: '1.0.0',
  description: 'Inventory and Warehouse Management',

  dependencies: {
    core: '3.0.0',
    modules: []
  },

  schema: {
    databases: [
      productsDatabase,
      categoriesDatabase,
      warehousesDatabase,
      stockLevelsDatabase,
      stockMovementsDatabase,
      suppliersDatabase,
      purchaseOrdersDatabase
    ],
    relations: [
      { from: 'products', to: 'categories', type: 'many-to-one', field: 'categoryId' },
      { from: 'products', to: 'suppliers', type: 'many-to-many', through: 'productSuppliers' },
      { from: 'stockLevels', to: 'products', type: 'many-to-one', field: 'productId' },
      { from: 'stockLevels', to: 'warehouses', type: 'many-to-one', field: 'warehouseId' },
      { from: 'stockMovements', to: 'products', type: 'many-to-one', field: 'productId' },
      { from: 'stockMovements', to: 'warehouses', type: 'many-to-one', field: 'warehouseId' },
      { from: 'purchaseOrders', to: 'suppliers', type: 'many-to-one', field: 'supplierId' }
    ]
  },

  components: {
    pages: [
      { id: 'products', name: 'Products', component: 'ProductsPage', icon: 'package' },
      { id: 'inventory', name: 'Inventory', component: 'InventoryPage', icon: 'layers' },
      { id: 'warehouses', name: 'Warehouses', component: 'WarehousesPage', icon: 'home' },
      { id: 'movements', name: 'Movements', component: 'MovementsPage', icon: 'truck' },
      { id: 'suppliers', name: 'Suppliers', component: 'SuppliersPage', icon: 'users' },
      {
        id: 'orders',
        name: 'Purchase Orders',
        component: 'PurchaseOrdersPage',
        icon: 'shopping-cart'
      },
      { id: 'reports', name: 'Reports', component: 'InventoryReportsPage', icon: 'bar-chart' }
    ],
    widgets: [
      { id: 'stock-value', name: 'Total Stock Value', component: 'StockValueWidget' },
      { id: 'low-stock', name: 'Low Stock Alerts', component: 'LowStockWidget' },
      { id: 'stock-movement', name: 'Stock Movement', component: 'StockMovementWidget' },
      { id: 'top-products', name: 'Top Products', component: 'TopProductsWidget' },
      {
        id: 'warehouse-utilization',
        name: 'Warehouse Utilization',
        component: 'WarehouseUtilizationWidget'
      }
    ],
    actions: [
      { id: 'add-product', name: 'Add Product', handler: 'addProduct' },
      { id: 'adjust-stock', name: 'Adjust Stock', handler: 'adjustStock' },
      { id: 'transfer-stock', name: 'Transfer Stock', handler: 'transferStock' },
      { id: 'create-po', name: 'Create Purchase Order', handler: 'createPurchaseOrder' },
      { id: 'scan-barcode', name: 'Scan Barcode', handler: 'scanBarcode' }
    ]
  },

  workflows: [
    lowStockAlertWorkflow,
    stockReceivedWorkflow,
    transferCompletedWorkflow,
    reorderPointWorkflow
  ],

  settings: [
    {
      id: 'defaultWarehouse',
      label: 'Default Warehouse',
      type: 'select',
      default: null
    },
    {
      id: 'lowStockThreshold',
      label: 'Default Low Stock Threshold',
      type: 'number',
      default: 10
    },
    {
      id: 'trackSerialNumbers',
      label: 'Track Serial Numbers',
      type: 'boolean',
      default: false
    },
    {
      id: 'allowNegativeStock',
      label: 'Allow Negative Stock',
      type: 'boolean',
      default: false
    },
    {
      id: 'costingMethod',
      label: 'Inventory Costing Method',
      type: 'select',
      options: [
        { label: 'FIFO (First In, First Out)', value: 'fifo' },
        { label: 'LIFO (Last In, First Out)', value: 'lifo' },
        { label: 'Weighted Average', value: 'average' }
      ],
      default: 'fifo'
    }
  ],

  hooks: {
    onInstall: async (context) => {
      // Create default warehouse
      await context.databases.get('inventory:warehouses').createRecord({
        name: 'Main Warehouse',
        code: 'WH-MAIN',
        isDefault: true,
        address: ''
      })

      // Create default categories
      const categories = context.databases.get('inventory:categories')
      await categories.createRecord({ name: 'Raw Materials', code: 'RAW' })
      await categories.createRecord({ name: 'Finished Goods', code: 'FIN' })
      await categories.createRecord({ name: 'Packaging', code: 'PKG' })
    }
  }
}
```

## Database Schemas

```typescript
// modules/inventory/src/databases/products.ts

export const productsDatabase: DatabaseTemplate = {
  id: 'inventory:products',
  name: 'Products',
  icon: 'package',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'sku', name: 'SKU', type: 'text', unique: true },
    { id: 'barcode', name: 'Barcode', type: 'text' },
    { id: 'categoryId', name: 'Category', type: 'relation', target: 'inventory:categories' },
    { id: 'description', name: 'Description', type: 'rich_text' },
    { id: 'images', name: 'Images', type: 'file', fileTypes: ['image'], multiple: true },

    // Pricing
    { id: 'costPrice', name: 'Cost Price', type: 'number', format: 'currency' },
    { id: 'sellingPrice', name: 'Selling Price', type: 'number', format: 'currency' },
    {
      id: 'margin',
      name: 'Margin',
      type: 'formula',
      formula: '(sellingPrice - costPrice) / sellingPrice * 100'
    },

    // Inventory
    { id: 'trackInventory', name: 'Track Inventory', type: 'checkbox', default: true },
    {
      id: 'totalStock',
      name: 'Total Stock',
      type: 'rollup',
      target: 'inventory:stockLevels',
      property: 'quantity',
      function: 'sum'
    },
    { id: 'reorderPoint', name: 'Reorder Point', type: 'number' },
    { id: 'reorderQuantity', name: 'Reorder Quantity', type: 'number' },

    // Dimensions
    { id: 'weight', name: 'Weight (kg)', type: 'number' },
    { id: 'length', name: 'Length (cm)', type: 'number' },
    { id: 'width', name: 'Width (cm)', type: 'number' },
    { id: 'height', name: 'Height (cm)', type: 'number' },

    // Variants
    { id: 'hasVariants', name: 'Has Variants', type: 'checkbox' },
    { id: 'variantOptions', name: 'Variant Options', type: 'json' }, // e.g., { size: ['S', 'M', 'L'], color: ['Red', 'Blue'] }
    {
      id: 'parentProductId',
      name: 'Parent Product',
      type: 'relation',
      target: 'inventory:products'
    },

    // Status
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'active', name: 'Active', color: 'green' },
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'discontinued', name: 'Discontinued', color: 'red' }
      ]
    },
    { id: 'isLowStock', name: 'Low Stock', type: 'formula', formula: 'totalStock <= reorderPoint' },

    // Metadata
    { id: 'tags', name: 'Tags', type: 'multi_select' },
    { id: 'notes', name: 'Notes', type: 'rich_text' }
  ],
  views: [
    {
      id: 'all',
      name: 'All Products',
      type: 'table',
      config: {
        visibleProperties: [
          'name',
          'sku',
          'categoryId',
          'totalStock',
          'costPrice',
          'sellingPrice',
          'status'
        ]
      }
    },
    {
      id: 'gallery',
      name: 'Product Gallery',
      type: 'gallery',
      config: {
        coverProperty: 'images',
        cardProperties: ['sku', 'sellingPrice', 'totalStock']
      }
    },
    {
      id: 'low-stock',
      name: 'Low Stock',
      type: 'table',
      config: {
        filter: { property: 'isLowStock', operator: 'equals', value: true },
        visibleProperties: ['name', 'sku', 'totalStock', 'reorderPoint', 'reorderQuantity']
      }
    },
    {
      id: 'by-category',
      name: 'By Category',
      type: 'board',
      config: {
        groupBy: 'categoryId',
        cardProperties: ['sku', 'totalStock', 'sellingPrice']
      }
    }
  ]
}

// modules/inventory/src/databases/warehouses.ts

export const warehousesDatabase: DatabaseTemplate = {
  id: 'inventory:warehouses',
  name: 'Warehouses',
  icon: 'home',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'code', name: 'Code', type: 'text', unique: true },
    { id: 'address', name: 'Address', type: 'text' },
    { id: 'city', name: 'City', type: 'text' },
    { id: 'country', name: 'Country', type: 'text' },
    { id: 'manager', name: 'Manager', type: 'person' },
    { id: 'phone', name: 'Phone', type: 'phone' },
    { id: 'email', name: 'Email', type: 'email' },
    { id: 'isDefault', name: 'Default', type: 'checkbox' },
    { id: 'isActive', name: 'Active', type: 'checkbox', default: true },

    // Capacity
    { id: 'capacity', name: 'Capacity (units)', type: 'number' },
    {
      id: 'currentStock',
      name: 'Current Stock',
      type: 'rollup',
      target: 'inventory:stockLevels',
      property: 'quantity',
      function: 'sum'
    },
    {
      id: 'utilization',
      name: 'Utilization %',
      type: 'formula',
      formula: 'capacity > 0 ? (currentStock / capacity * 100) : 0'
    },

    // Value
    {
      id: 'stockValue',
      name: 'Stock Value',
      type: 'rollup',
      target: 'inventory:stockLevels',
      property: 'value',
      function: 'sum'
    },

    // Zones (for larger warehouses)
    { id: 'zones', name: 'Zones', type: 'json' } // e.g., [{ name: 'A', rows: 10, shelves: 5 }]
  ]
}

// modules/inventory/src/databases/stockLevels.ts

export const stockLevelsDatabase: DatabaseTemplate = {
  id: 'inventory:stockLevels',
  name: 'Stock Levels',
  icon: 'layers',
  properties: [
    { id: 'productId', name: 'Product', type: 'relation', target: 'inventory:products' },
    { id: 'warehouseId', name: 'Warehouse', type: 'relation', target: 'inventory:warehouses' },
    { id: 'quantity', name: 'Quantity', type: 'number' },
    { id: 'reservedQuantity', name: 'Reserved', type: 'number', default: 0 },
    {
      id: 'availableQuantity',
      name: 'Available',
      type: 'formula',
      formula: 'quantity - reservedQuantity'
    },
    { id: 'value', name: 'Value', type: 'formula', formula: 'quantity * productId.costPrice' },

    // Location
    { id: 'zone', name: 'Zone', type: 'text' },
    { id: 'row', name: 'Row', type: 'text' },
    { id: 'shelf', name: 'Shelf', type: 'text' },
    { id: 'bin', name: 'Bin', type: 'text' },

    // Lot/Batch tracking
    { id: 'lotNumber', name: 'Lot Number', type: 'text' },
    { id: 'expiryDate', name: 'Expiry Date', type: 'date' },
    { id: 'serialNumbers', name: 'Serial Numbers', type: 'json' },

    // Timestamps
    { id: 'lastCounted', name: 'Last Counted', type: 'date' },
    { id: 'updatedAt', name: 'Updated At', type: 'date' }
  ],
  views: [
    {
      id: 'by-product',
      name: 'By Product',
      type: 'table',
      config: {
        groupBy: 'productId',
        visibleProperties: ['warehouseId', 'quantity', 'availableQuantity', 'zone', 'row', 'shelf']
      }
    },
    {
      id: 'by-warehouse',
      name: 'By Warehouse',
      type: 'table',
      config: {
        groupBy: 'warehouseId',
        visibleProperties: ['productId', 'quantity', 'availableQuantity', 'value']
      }
    },
    {
      id: 'expiring',
      name: 'Expiring Soon',
      type: 'table',
      config: {
        filter: {
          and: [
            { property: 'expiryDate', operator: 'is_not_empty' },
            { property: 'expiryDate', operator: 'is_within', value: { days: 30 } }
          ]
        },
        sorts: [{ property: 'expiryDate', direction: 'asc' }]
      }
    }
  ]
}

// modules/inventory/src/databases/stockMovements.ts

export const stockMovementsDatabase: DatabaseTemplate = {
  id: 'inventory:stockMovements',
  name: 'Stock Movements',
  icon: 'truck',
  properties: [
    { id: 'reference', name: 'Reference', type: 'title' },
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      options: [
        { id: 'receipt', name: 'Receipt', color: 'green' },
        { id: 'shipment', name: 'Shipment', color: 'blue' },
        { id: 'transfer', name: 'Transfer', color: 'purple' },
        { id: 'adjustment', name: 'Adjustment', color: 'yellow' },
        { id: 'return', name: 'Return', color: 'orange' },
        { id: 'damage', name: 'Damage', color: 'red' }
      ]
    },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'pending', name: 'Pending', color: 'yellow' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'completed', name: 'Completed', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ]
    },
    { id: 'productId', name: 'Product', type: 'relation', target: 'inventory:products' },
    { id: 'quantity', name: 'Quantity', type: 'number' },

    // Locations
    {
      id: 'fromWarehouseId',
      name: 'From Warehouse',
      type: 'relation',
      target: 'inventory:warehouses'
    },
    { id: 'toWarehouseId', name: 'To Warehouse', type: 'relation', target: 'inventory:warehouses' },
    { id: 'fromLocation', name: 'From Location', type: 'text' },
    { id: 'toLocation', name: 'To Location', type: 'text' },

    // Source documents
    {
      id: 'sourceType',
      name: 'Source Type',
      type: 'select',
      options: [
        { id: 'purchase_order', name: 'Purchase Order' },
        { id: 'sales_order', name: 'Sales Order' },
        { id: 'manual', name: 'Manual' },
        { id: 'inventory_count', name: 'Inventory Count' }
      ]
    },
    { id: 'sourceId', name: 'Source Reference', type: 'text' },

    // Batch/Serial
    { id: 'lotNumber', name: 'Lot Number', type: 'text' },
    { id: 'serialNumbers', name: 'Serial Numbers', type: 'json' },

    // Cost
    { id: 'unitCost', name: 'Unit Cost', type: 'number', format: 'currency' },
    { id: 'totalCost', name: 'Total Cost', type: 'formula', formula: 'quantity * unitCost' },

    // Dates
    { id: 'scheduledDate', name: 'Scheduled Date', type: 'date' },
    { id: 'completedDate', name: 'Completed Date', type: 'date' },

    // People
    { id: 'createdBy', name: 'Created By', type: 'person' },
    { id: 'completedBy', name: 'Completed By', type: 'person' },

    // Notes
    { id: 'reason', name: 'Reason', type: 'text' },
    { id: 'notes', name: 'Notes', type: 'rich_text' }
  ],
  views: [
    {
      id: 'recent',
      name: 'Recent Movements',
      type: 'table',
      config: {
        sorts: [{ property: 'completedDate', direction: 'desc' }],
        limit: 50
      }
    },
    {
      id: 'by-type',
      name: 'By Type',
      type: 'board',
      config: {
        groupBy: 'type'
      }
    },
    {
      id: 'pending',
      name: 'Pending',
      type: 'table',
      config: {
        filter: { property: 'status', operator: 'in', value: ['draft', 'pending', 'in-progress'] }
      }
    }
  ]
}

// modules/inventory/src/databases/purchaseOrders.ts

export const purchaseOrdersDatabase: DatabaseTemplate = {
  id: 'inventory:purchaseOrders',
  name: 'Purchase Orders',
  icon: 'shopping-cart',
  properties: [
    { id: 'poNumber', name: 'PO Number', type: 'title' },
    { id: 'supplierId', name: 'Supplier', type: 'relation', target: 'inventory:suppliers' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'sent', name: 'Sent', color: 'blue' },
        { id: 'confirmed', name: 'Confirmed', color: 'yellow' },
        { id: 'partial', name: 'Partially Received', color: 'orange' },
        { id: 'received', name: 'Received', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ]
    },

    // Items
    { id: 'items', name: 'Items', type: 'json' }, // Array of { productId, quantity, unitPrice, received }
    { id: 'itemCount', name: 'Item Count', type: 'formula', formula: 'length(items)' },

    // Totals
    { id: 'subtotal', name: 'Subtotal', type: 'number', format: 'currency' },
    { id: 'tax', name: 'Tax', type: 'number', format: 'currency' },
    { id: 'shipping', name: 'Shipping', type: 'number', format: 'currency' },
    { id: 'total', name: 'Total', type: 'formula', formula: 'subtotal + tax + shipping' },

    // Dates
    { id: 'orderDate', name: 'Order Date', type: 'date' },
    { id: 'expectedDate', name: 'Expected Date', type: 'date' },
    { id: 'receivedDate', name: 'Received Date', type: 'date' },

    // Delivery
    { id: 'warehouseId', name: 'Deliver To', type: 'relation', target: 'inventory:warehouses' },
    { id: 'shippingAddress', name: 'Shipping Address', type: 'text' },
    { id: 'trackingNumber', name: 'Tracking Number', type: 'text' },

    // People
    { id: 'createdBy', name: 'Created By', type: 'person' },
    { id: 'approvedBy', name: 'Approved By', type: 'person' },

    // Notes
    { id: 'notes', name: 'Notes', type: 'rich_text' },
    { id: 'supplierNotes', name: 'Supplier Notes', type: 'text' }
  ]
}
```

## Stock Management Service

```typescript
// modules/inventory/src/services/StockService.ts

import { DatabaseManager } from '@xnet/database'

export class StockService {
  constructor(private databaseManager: DatabaseManager) {}

  // Adjust stock level
  async adjustStock(params: {
    productId: string
    warehouseId: string
    quantity: number // Positive or negative
    reason: string
    lotNumber?: string
    location?: { zone?: string; row?: string; shelf?: string; bin?: string }
  }): Promise<StockMovement> {
    const stockLevels = await this.databaseManager.getDatabase('inventory:stockLevels')
    const movements = await this.databaseManager.getDatabase('inventory:stockMovements')

    // Find or create stock level record
    let stockLevel = await stockLevels
      .query()
      .filter({
        and: [
          { property: 'productId', operator: 'equals', value: params.productId },
          { property: 'warehouseId', operator: 'equals', value: params.warehouseId },
          { property: 'lotNumber', operator: 'equals', value: params.lotNumber || null }
        ]
      })
      .first()

    if (!stockLevel) {
      if (params.quantity < 0) {
        throw new Error('Cannot reduce stock: no stock exists at this location')
      }
      stockLevel = await stockLevels.createRecord({
        productId: params.productId,
        warehouseId: params.warehouseId,
        quantity: 0,
        reservedQuantity: 0,
        lotNumber: params.lotNumber,
        ...params.location
      })
    }

    // Check if we can reduce stock
    const newQuantity = stockLevel.quantity + params.quantity
    const settings = await this.getSettings()
    if (newQuantity < 0 && !settings.allowNegativeStock) {
      throw new Error(
        `Insufficient stock. Available: ${stockLevel.quantity}, Requested: ${Math.abs(params.quantity)}`
      )
    }

    // Update stock level
    await stockLevels.updateRecord(stockLevel.id, {
      quantity: newQuantity,
      updatedAt: Date.now()
    })

    // Create movement record
    const movement = await movements.createRecord({
      reference: `ADJ-${Date.now()}`,
      type: 'adjustment',
      status: 'completed',
      productId: params.productId,
      toWarehouseId: params.warehouseId,
      quantity: params.quantity,
      reason: params.reason,
      lotNumber: params.lotNumber,
      completedDate: Date.now(),
      createdBy: await this.getCurrentUserId()
    })

    return movement
  }

  // Transfer stock between warehouses
  async transferStock(params: {
    productId: string
    fromWarehouseId: string
    toWarehouseId: string
    quantity: number
    lotNumber?: string
    scheduledDate?: number
  }): Promise<StockMovement> {
    const movements = await this.databaseManager.getDatabase('inventory:stockMovements')

    // Create transfer movement (pending)
    const movement = await movements.createRecord({
      reference: `TRF-${Date.now()}`,
      type: 'transfer',
      status: params.scheduledDate ? 'pending' : 'in-progress',
      productId: params.productId,
      fromWarehouseId: params.fromWarehouseId,
      toWarehouseId: params.toWarehouseId,
      quantity: params.quantity,
      lotNumber: params.lotNumber,
      scheduledDate: params.scheduledDate,
      createdBy: await this.getCurrentUserId()
    })

    // If immediate transfer, execute it
    if (!params.scheduledDate) {
      await this.executeTransfer(movement.id)
    }

    return movement
  }

  // Execute a pending transfer
  async executeTransfer(movementId: string): Promise<void> {
    const movements = await this.databaseManager.getDatabase('inventory:stockMovements')
    const movement = await movements.getRecord(movementId)

    if (!movement || movement.type !== 'transfer') {
      throw new Error('Invalid transfer movement')
    }

    if (movement.status === 'completed') {
      throw new Error('Transfer already completed')
    }

    // Reduce from source warehouse
    await this.adjustStock({
      productId: movement.productId,
      warehouseId: movement.fromWarehouseId,
      quantity: -movement.quantity,
      reason: `Transfer to ${movement.toWarehouseId}`,
      lotNumber: movement.lotNumber
    })

    // Add to destination warehouse
    await this.adjustStock({
      productId: movement.productId,
      warehouseId: movement.toWarehouseId,
      quantity: movement.quantity,
      reason: `Transfer from ${movement.fromWarehouseId}`,
      lotNumber: movement.lotNumber
    })

    // Update movement status
    await movements.updateRecord(movementId, {
      status: 'completed',
      completedDate: Date.now(),
      completedBy: await this.getCurrentUserId()
    })
  }

  // Receive stock from purchase order
  async receiveStock(params: {
    purchaseOrderId: string
    items: Array<{
      productId: string
      quantity: number
      lotNumber?: string
      location?: { zone?: string; row?: string; shelf?: string; bin?: string }
    }>
  }): Promise<StockMovement[]> {
    const purchaseOrders = await this.databaseManager.getDatabase('inventory:purchaseOrders')
    const po = await purchaseOrders.getRecord(params.purchaseOrderId)

    if (!po) {
      throw new Error('Purchase order not found')
    }

    const movements: StockMovement[] = []

    for (const item of params.items) {
      const movement = await this.adjustStock({
        productId: item.productId,
        warehouseId: po.warehouseId,
        quantity: item.quantity,
        reason: `Received from PO ${po.poNumber}`,
        lotNumber: item.lotNumber,
        location: item.location
      })

      movements.push(movement)
    }

    // Update PO status
    const allReceived = this.checkAllItemsReceived(po, params.items)
    await purchaseOrders.updateRecord(params.purchaseOrderId, {
      status: allReceived ? 'received' : 'partial',
      receivedDate: allReceived ? Date.now() : po.receivedDate
    })

    return movements
  }

  // Get stock across all warehouses for a product
  async getStockSummary(productId: string): Promise<StockSummary> {
    const stockLevels = await this.databaseManager.getDatabase('inventory:stockLevels')
    const levels = await stockLevels
      .query()
      .filter({ property: 'productId', operator: 'equals', value: productId })
      .execute()

    const byWarehouse: Record<string, number> = {}
    let total = 0
    let reserved = 0
    let value = 0

    for (const level of levels.records) {
      byWarehouse[level.warehouseId] = (byWarehouse[level.warehouseId] || 0) + level.quantity
      total += level.quantity
      reserved += level.reservedQuantity || 0
      value += level.value || 0
    }

    return {
      productId,
      total,
      available: total - reserved,
      reserved,
      value,
      byWarehouse
    }
  }

  // Check for low stock products
  async getLowStockProducts(): Promise<
    Array<{
      product: Product
      currentStock: number
      reorderPoint: number
      reorderQuantity: number
    }>
  > {
    const products = await this.databaseManager.getDatabase('inventory:products')
    const lowStock = await products
      .query()
      .filter({
        and: [
          { property: 'trackInventory', operator: 'equals', value: true },
          { property: 'isLowStock', operator: 'equals', value: true },
          { property: 'status', operator: 'equals', value: 'active' }
        ]
      })
      .execute()

    return lowStock.records.map((product) => ({
      product,
      currentStock: product.totalStock,
      reorderPoint: product.reorderPoint,
      reorderQuantity: product.reorderQuantity
    }))
  }

  // Inventory count / stock take
  async performStockCount(params: {
    warehouseId: string
    counts: Array<{
      productId: string
      countedQuantity: number
      lotNumber?: string
    }>
  }): Promise<StockCountResult> {
    const results: StockCountResult = {
      warehouseId: params.warehouseId,
      countedAt: Date.now(),
      items: [],
      adjustments: []
    }

    for (const count of params.counts) {
      const summary = await this.getStockSummary(count.productId)
      const systemQuantity = summary.byWarehouse[params.warehouseId] || 0
      const variance = count.countedQuantity - systemQuantity

      results.items.push({
        productId: count.productId,
        systemQuantity,
        countedQuantity: count.countedQuantity,
        variance
      })

      // Create adjustment if there's a variance
      if (variance !== 0) {
        const movement = await this.adjustStock({
          productId: count.productId,
          warehouseId: params.warehouseId,
          quantity: variance,
          reason: 'Inventory count adjustment',
          lotNumber: count.lotNumber
        })
        results.adjustments.push(movement)
      }

      // Update last counted date
      const stockLevels = await this.databaseManager.getDatabase('inventory:stockLevels')
      const level = await stockLevels
        .query()
        .filter({
          and: [
            { property: 'productId', operator: 'equals', value: count.productId },
            { property: 'warehouseId', operator: 'equals', value: params.warehouseId }
          ]
        })
        .first()

      if (level) {
        await stockLevels.updateRecord(level.id, { lastCounted: Date.now() })
      }
    }

    return results
  }
}

interface StockSummary {
  productId: string
  total: number
  available: number
  reserved: number
  value: number
  byWarehouse: Record<string, number>
}

interface StockCountResult {
  warehouseId: string
  countedAt: number
  items: Array<{
    productId: string
    systemQuantity: number
    countedQuantity: number
    variance: number
  }>
  adjustments: StockMovement[]
}
```

## Barcode Scanner Integration

```typescript
// modules/inventory/src/components/BarcodeScanner.tsx

import React, { useEffect, useRef, useState } from 'react'
import { useDatabase } from '@xnet/database'

interface BarcodeScannerProps {
  onScan: (product: Product) => void
  onNotFound: (barcode: string) => void
}

export function BarcodeScanner({ onScan, onNotFound }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { database } = useDatabase('inventory:products')

  // Handle barcode input (works with USB barcode scanners)
  const handleBarcodeInput = async (barcode: string) => {
    if (!barcode || barcode === lastScanned) return

    setLastScanned(barcode)

    // Look up product by barcode or SKU
    const results = await database.query()
      .filter({
        or: [
          { property: 'barcode', operator: 'equals', value: barcode },
          { property: 'sku', operator: 'equals', value: barcode }
        ]
      })
      .execute()

    if (results.records.length > 0) {
      onScan(results.records[0])
    } else {
      onNotFound(barcode)
    }

    // Reset for next scan
    setTimeout(() => setLastScanned(null), 1000)
  }

  // Camera-based scanning (for mobile)
  const startCameraScanning = async () => {
    setIsScanning(true)

    try {
      // Use native barcode scanning API if available
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code']
        })

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })

        const video = document.createElement('video')
        video.srcObject = stream
        await video.play()

        const detectBarcode = async () => {
          if (!isScanning) {
            stream.getTracks().forEach(track => track.stop())
            return
          }

          const barcodes = await barcodeDetector.detect(video)
          if (barcodes.length > 0) {
            await handleBarcodeInput(barcodes[0].rawValue)
          }

          requestAnimationFrame(detectBarcode)
        }

        detectBarcode()
      }
    } catch (error) {
      console.error('Camera scanning not available:', error)
      setIsScanning(false)
    }
  }

  // Focus input for USB scanner
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="barcode-scanner">
      {/* Hidden input for USB barcode scanners */}
      <input
        ref={inputRef}
        type="text"
        className="barcode-input"
        placeholder="Scan barcode..."
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleBarcodeInput(e.currentTarget.value)
            e.currentTarget.value = ''
          }
        }}
        autoFocus
      />

      {/* Camera scanner button */}
      <button
        className="camera-scan-button"
        onClick={startCameraScanning}
        disabled={isScanning}
      >
        {isScanning ? 'Scanning...' : 'Scan with Camera'}
      </button>

      {lastScanned && (
        <div className="last-scanned">
          Last scanned: {lastScanned}
        </div>
      )}
    </div>
  )
}
```

## Workflows

```typescript
// modules/inventory/src/workflows/lowStockAlert.ts

export const lowStockAlertWorkflow: WorkflowTemplate = {
  id: 'inventory:low-stock-alert',
  name: 'Low Stock Alert',
  description: 'Alert when product stock falls below reorder point',

  trigger: {
    type: 'property_change',
    config: {
      databaseId: 'inventory:stockLevels',
      property: 'quantity'
    }
  },

  conditions: [
    {
      type: 'compare',
      config: {
        left: '{{record.quantity}}',
        operator: 'less_than_or_equal',
        right: '{{record.productId.reorderPoint}}'
      }
    }
  ],

  actions: [
    // Notify inventory manager
    {
      id: 'notify-manager',
      type: 'notification',
      config: {
        role: 'inventory-manager',
        title: 'Low Stock Alert',
        message: '{{record.productId.name}} is low on stock ({{record.quantity}} remaining)',
        priority: 'high'
      }
    },
    // Send email
    {
      id: 'send-email',
      type: 'email',
      config: {
        to: '{{settings.inventoryAlertEmail}}',
        template: 'low-stock-alert',
        data: {
          product: '{{record.productId.name}}',
          sku: '{{record.productId.sku}}',
          currentStock: '{{record.quantity}}',
          reorderPoint: '{{record.productId.reorderPoint}}',
          reorderQuantity: '{{record.productId.reorderQuantity}}',
          warehouse: '{{record.warehouseId.name}}'
        }
      }
    }
  ]
}

// modules/inventory/src/workflows/reorderPoint.ts

export const reorderPointWorkflow: WorkflowTemplate = {
  id: 'inventory:reorder-point',
  name: 'Auto Reorder',
  description: 'Automatically create purchase order when stock is low',

  trigger: {
    type: 'property_change',
    config: {
      databaseId: 'inventory:stockLevels',
      property: 'quantity'
    }
  },

  conditions: [
    {
      type: 'and',
      conditions: [
        {
          type: 'compare',
          config: {
            left: '{{record.quantity}}',
            operator: 'less_than_or_equal',
            right: '{{record.productId.reorderPoint}}'
          }
        },
        {
          type: 'compare',
          config: {
            left: '{{settings.autoReorder}}',
            operator: 'equals',
            right: true
          }
        }
      ]
    }
  ],

  actions: [
    // Check if PO already exists
    {
      id: 'check-existing-po',
      type: 'query',
      config: {
        databaseId: 'inventory:purchaseOrders',
        filter: {
          and: [
            { property: 'status', operator: 'in', value: ['draft', 'sent', 'confirmed'] },
            {
              property: 'items',
              operator: 'contains',
              value: { productId: '{{record.productId.id}}' }
            }
          ]
        }
      },
      output: 'existingPOs'
    },
    // Create PO if none exists
    {
      id: 'create-po',
      type: 'conditional',
      config: {
        condition: '{{existingPOs.length}} == 0',
        then: [
          {
            type: 'create_record',
            config: {
              databaseId: 'inventory:purchaseOrders',
              data: {
                poNumber: 'AUTO-{{now | date: "YYYYMMDDHHmmss"}}',
                supplierId: '{{record.productId.preferredSupplierId}}',
                status: 'draft',
                items: [
                  {
                    productId: '{{record.productId.id}}',
                    quantity: '{{record.productId.reorderQuantity}}',
                    unitPrice: '{{record.productId.costPrice}}'
                  }
                ],
                warehouseId: '{{record.warehouseId}}',
                orderDate: '{{now}}'
              }
            }
          }
        ]
      }
    }
  ]
}
```

## File Structure

```
modules/inventory/
├── src/
│   ├── index.ts
│   ├── module.ts
│   ├── databases/
│   │   ├── products.ts
│   │   ├── categories.ts
│   │   ├── warehouses.ts
│   │   ├── stockLevels.ts
│   │   ├── stockMovements.ts
│   │   ├── suppliers.ts
│   │   └── purchaseOrders.ts
│   ├── components/
│   │   ├── pages/
│   │   │   ├── ProductsPage.tsx
│   │   │   ├── InventoryPage.tsx
│   │   │   ├── WarehousesPage.tsx
│   │   │   ├── MovementsPage.tsx
│   │   │   ├── SuppliersPage.tsx
│   │   │   ├── PurchaseOrdersPage.tsx
│   │   │   └── InventoryReportsPage.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductForm.tsx
│   │   ├── StockLevelTable.tsx
│   │   ├── MovementForm.tsx
│   │   ├── PurchaseOrderForm.tsx
│   │   ├── BarcodeScanner.tsx
│   │   └── StockCountSheet.tsx
│   ├── widgets/
│   │   ├── StockValueWidget.tsx
│   │   ├── LowStockWidget.tsx
│   │   ├── StockMovementWidget.tsx
│   │   ├── TopProductsWidget.tsx
│   │   └── WarehouseUtilizationWidget.tsx
│   ├── services/
│   │   ├── StockService.ts
│   │   ├── CostingService.ts
│   │   └── BarcodeService.ts
│   ├── workflows/
│   │   ├── lowStockAlert.ts
│   │   ├── stockReceived.ts
│   │   ├── transferCompleted.ts
│   │   └── reorderPoint.ts
│   └── settings/
│       └── InventorySettings.tsx
├── tests/
│   ├── stockService.test.ts
│   ├── movements.test.ts
│   ├── costing.test.ts
│   └── workflows.test.ts
└── package.json
```

## Validation Checklist

```markdown
## Inventory Module Validation

### Products

- [ ] Create product with all fields
- [ ] Create product variants
- [ ] Upload product images
- [ ] Set reorder points
- [ ] Product gallery view works

### Stock Levels

- [ ] View stock by product
- [ ] View stock by warehouse
- [ ] Stock value calculates correctly
- [ ] Low stock indicator works
- [ ] Expiry date tracking works

### Stock Movements

- [ ] Adjust stock (add/remove)
- [ ] Transfer between warehouses
- [ ] Movement history tracks correctly
- [ ] Negative stock prevention works (if enabled)

### Barcode Scanning

- [ ] USB barcode scanner works
- [ ] Camera scanning works (mobile)
- [ ] Product lookup by barcode/SKU
- [ ] Unknown barcode handling

### Purchase Orders

- [ ] Create purchase order
- [ ] Add items to PO
- [ ] Send PO to supplier
- [ ] Receive partial/full shipment
- [ ] Stock updates on receipt

### Warehouses

- [ ] Create warehouse
- [ ] Set default warehouse
- [ ] Utilization tracking
- [ ] Zone/location management

### Workflows

- [ ] Low stock alert fires
- [ ] Auto-reorder creates PO
- [ ] Stock receipt workflow works

### Reports

- [ ] Stock valuation report
- [ ] Movement history report
- [ ] Low stock report
- [ ] Expiring items report
```

---

[← Back to HRM Module](./06-hrm-module.md) | [Next: Finance Module →](./08-finance-module.md)
