# 08: Finance Module

> Invoicing, expense management, budgets, and financial reporting

**Package:** `modules/@xnet/finance`
**Dependencies:** `@xnet/modules`, `@xnet/workflows`, `@xnet/dashboard`, `@xnet/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - Finance entities (Invoice, Expense, Budget) defined as Schemas
> - All finance data stored as Nodes in NodeStore

## Goals

- Invoice creation and management
- Expense tracking and approval
- Budget planning and monitoring
- Financial dashboards and reports
- PDF generation for invoices

## Module Definition

```typescript
// modules/finance/src/module.ts

import { ModuleDefinition } from '@xnet/modules'

export const FinanceModule: ModuleDefinition = {
  id: 'mod:finance',
  name: 'Finance',
  version: '1.0.0',
  description: 'Financial Management',

  dependencies: {
    core: '3.0.0',
    modules: ['mod:crm'] // Optional: for customer invoicing
  },

  schema: {
    databases: [
      invoicesDatabase,
      invoiceItemsDatabase,
      expensesDatabase,
      expenseCategoriesDatabase,
      budgetsDatabase,
      accountsDatabase,
      transactionsDatabase,
      taxRatesDatabase
    ],
    relations: [
      { from: 'invoices', to: 'crm:companies', type: 'many-to-one', field: 'customerId' },
      { from: 'invoiceItems', to: 'invoices', type: 'many-to-one', field: 'invoiceId' },
      { from: 'expenses', to: 'expenseCategories', type: 'many-to-one', field: 'categoryId' },
      { from: 'transactions', to: 'accounts', type: 'many-to-one', field: 'accountId' },
      { from: 'budgets', to: 'expenseCategories', type: 'many-to-one', field: 'categoryId' }
    ]
  },

  components: {
    pages: [
      { id: 'invoices', name: 'Invoices', component: 'InvoicesPage', icon: 'file-text' },
      { id: 'expenses', name: 'Expenses', component: 'ExpensesPage', icon: 'credit-card' },
      { id: 'budgets', name: 'Budgets', component: 'BudgetsPage', icon: 'pie-chart' },
      { id: 'accounts', name: 'Accounts', component: 'AccountsPage', icon: 'briefcase' },
      { id: 'reports', name: 'Reports', component: 'FinanceReportsPage', icon: 'bar-chart' }
    ],
    widgets: [
      { id: 'revenue', name: 'Revenue', component: 'RevenueWidget' },
      { id: 'expenses-summary', name: 'Expenses Summary', component: 'ExpensesSummaryWidget' },
      { id: 'cash-flow', name: 'Cash Flow', component: 'CashFlowWidget' },
      {
        id: 'outstanding-invoices',
        name: 'Outstanding Invoices',
        component: 'OutstandingInvoicesWidget'
      },
      { id: 'budget-status', name: 'Budget Status', component: 'BudgetStatusWidget' }
    ],
    actions: [
      { id: 'create-invoice', name: 'Create Invoice', handler: 'createInvoice' },
      { id: 'record-expense', name: 'Record Expense', handler: 'recordExpense' },
      { id: 'record-payment', name: 'Record Payment', handler: 'recordPayment' }
    ]
  },

  workflows: [
    invoiceOverdueWorkflow,
    expenseApprovalWorkflow,
    budgetAlertWorkflow,
    paymentReceivedWorkflow
  ],

  settings: [
    {
      id: 'currency',
      label: 'Default Currency',
      type: 'select',
      options: [
        { label: 'USD ($)', value: 'USD' },
        { label: 'EUR (€)', value: 'EUR' },
        { label: 'GBP (£)', value: 'GBP' },
        { label: 'JPY (¥)', value: 'JPY' }
      ],
      default: 'USD'
    },
    {
      id: 'invoicePrefix',
      label: 'Invoice Number Prefix',
      type: 'text',
      default: 'INV-'
    },
    {
      id: 'paymentTerms',
      label: 'Default Payment Terms (days)',
      type: 'number',
      default: 30
    },
    {
      id: 'taxRate',
      label: 'Default Tax Rate (%)',
      type: 'number',
      default: 0
    },
    {
      id: 'companyInfo',
      label: 'Company Information',
      type: 'json',
      default: {}
    }
  ],

  hooks: {
    onInstall: async (context) => {
      // Create default expense categories
      const categories = context.databases.get('finance:expenseCategories')
      await categories.createRecord({ name: 'Office Supplies', code: 'OFF' })
      await categories.createRecord({ name: 'Travel', code: 'TRV' })
      await categories.createRecord({ name: 'Software', code: 'SFT' })
      await categories.createRecord({ name: 'Marketing', code: 'MKT' })
      await categories.createRecord({ name: 'Utilities', code: 'UTL' })
      await categories.createRecord({ name: 'Payroll', code: 'PAY' })

      // Create default accounts
      const accounts = context.databases.get('finance:accounts')
      await accounts.createRecord({ name: 'Operating Account', type: 'bank', isDefault: true })
      await accounts.createRecord({ name: 'Petty Cash', type: 'cash' })
    }
  }
}
```

## Database Schemas

```typescript
// modules/finance/src/databases/invoices.ts

export const invoicesDatabase: DatabaseTemplate = {
  id: 'finance:invoices',
  name: 'Invoices',
  icon: 'file-text',
  properties: [
    { id: 'invoiceNumber', name: 'Invoice #', type: 'title' },
    { id: 'customerId', name: 'Customer', type: 'relation', target: 'crm:companies' },
    { id: 'contactId', name: 'Contact', type: 'relation', target: 'crm:contacts' },

    // Status
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'sent', name: 'Sent', color: 'blue' },
        { id: 'viewed', name: 'Viewed', color: 'yellow' },
        { id: 'partial', name: 'Partially Paid', color: 'orange' },
        { id: 'paid', name: 'Paid', color: 'green' },
        { id: 'overdue', name: 'Overdue', color: 'red' },
        { id: 'cancelled', name: 'Cancelled', color: 'gray' }
      ]
    },

    // Dates
    { id: 'issueDate', name: 'Issue Date', type: 'date' },
    { id: 'dueDate', name: 'Due Date', type: 'date' },
    { id: 'paidDate', name: 'Paid Date', type: 'date' },

    // Amounts
    { id: 'subtotal', name: 'Subtotal', type: 'number', format: 'currency' },
    { id: 'taxAmount', name: 'Tax', type: 'number', format: 'currency' },
    { id: 'discount', name: 'Discount', type: 'number', format: 'currency' },
    { id: 'total', name: 'Total', type: 'formula', formula: 'subtotal + taxAmount - discount' },
    { id: 'amountPaid', name: 'Amount Paid', type: 'number', format: 'currency', default: 0 },
    { id: 'balanceDue', name: 'Balance Due', type: 'formula', formula: 'total - amountPaid' },
    {
      id: 'currency',
      name: 'Currency',
      type: 'select',
      options: [
        { id: 'USD', name: 'USD' },
        { id: 'EUR', name: 'EUR' },
        { id: 'GBP', name: 'GBP' }
      ]
    },

    // Calculations
    {
      id: 'isOverdue',
      name: 'Is Overdue',
      type: 'formula',
      formula: 'status != "paid" && status != "cancelled" && dueDate < now()'
    },
    {
      id: 'daysOverdue',
      name: 'Days Overdue',
      type: 'formula',
      formula: 'isOverdue ? dateDiff(dueDate, now(), "days") : 0'
    },

    // Details
    { id: 'billingAddress', name: 'Billing Address', type: 'text' },
    { id: 'shippingAddress', name: 'Shipping Address', type: 'text' },
    { id: 'notes', name: 'Notes', type: 'rich_text' },
    { id: 'terms', name: 'Terms & Conditions', type: 'rich_text' },

    // Attachments
    { id: 'attachments', name: 'Attachments', type: 'file', multiple: true },

    // Tracking
    { id: 'sentAt', name: 'Sent At', type: 'date' },
    { id: 'viewedAt', name: 'Viewed At', type: 'date' },
    { id: 'createdBy', name: 'Created By', type: 'person' }
  ],
  views: [
    {
      id: 'all',
      name: 'All Invoices',
      type: 'table',
      config: {
        visibleProperties: [
          'invoiceNumber',
          'customerId',
          'status',
          'total',
          'balanceDue',
          'dueDate'
        ],
        sorts: [{ property: 'issueDate', direction: 'desc' }]
      }
    },
    {
      id: 'unpaid',
      name: 'Unpaid',
      type: 'table',
      config: {
        filter: {
          property: 'status',
          operator: 'in',
          value: ['sent', 'viewed', 'partial', 'overdue']
        },
        sorts: [{ property: 'dueDate', direction: 'asc' }]
      }
    },
    {
      id: 'overdue',
      name: 'Overdue',
      type: 'table',
      config: {
        filter: { property: 'status', operator: 'equals', value: 'overdue' },
        sorts: [{ property: 'daysOverdue', direction: 'desc' }]
      }
    },
    {
      id: 'by-customer',
      name: 'By Customer',
      type: 'board',
      config: {
        groupBy: 'customerId'
      }
    }
  ]
}

// modules/finance/src/databases/expenses.ts

export const expensesDatabase: DatabaseTemplate = {
  id: 'finance:expenses',
  name: 'Expenses',
  icon: 'credit-card',
  properties: [
    { id: 'description', name: 'Description', type: 'title' },
    { id: 'categoryId', name: 'Category', type: 'relation', target: 'finance:expenseCategories' },
    { id: 'amount', name: 'Amount', type: 'number', format: 'currency' },
    {
      id: 'currency',
      name: 'Currency',
      type: 'select',
      options: [
        { id: 'USD', name: 'USD' },
        { id: 'EUR', name: 'EUR' },
        { id: 'GBP', name: 'GBP' }
      ]
    },
    { id: 'date', name: 'Date', type: 'date' },

    // Status
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'pending', name: 'Pending Approval', color: 'yellow' },
        { id: 'approved', name: 'Approved', color: 'green' },
        { id: 'rejected', name: 'Rejected', color: 'red' },
        { id: 'reimbursed', name: 'Reimbursed', color: 'blue' }
      ]
    },

    // People
    { id: 'submittedBy', name: 'Submitted By', type: 'person' },
    { id: 'approvedBy', name: 'Approved By', type: 'person' },
    { id: 'approvedAt', name: 'Approved At', type: 'date' },

    // Details
    { id: 'vendor', name: 'Vendor', type: 'text' },
    {
      id: 'paymentMethod',
      name: 'Payment Method',
      type: 'select',
      options: [
        { id: 'cash', name: 'Cash' },
        { id: 'credit_card', name: 'Credit Card' },
        { id: 'debit_card', name: 'Debit Card' },
        { id: 'bank_transfer', name: 'Bank Transfer' },
        { id: 'reimbursable', name: 'Reimbursable' }
      ]
    },
    { id: 'receipt', name: 'Receipt', type: 'file', fileTypes: ['image', 'pdf'] },
    { id: 'notes', name: 'Notes', type: 'text' },

    // Linking
    { id: 'projectId', name: 'Project', type: 'relation', target: 'projects:projects' },
    { id: 'billable', name: 'Billable', type: 'checkbox' },

    // Tax
    { id: 'taxDeductible', name: 'Tax Deductible', type: 'checkbox' }
  ],
  views: [
    {
      id: 'all',
      name: 'All Expenses',
      type: 'table',
      config: {
        visibleProperties: ['description', 'categoryId', 'amount', 'date', 'status', 'submittedBy'],
        sorts: [{ property: 'date', direction: 'desc' }]
      }
    },
    {
      id: 'pending',
      name: 'Pending Approval',
      type: 'table',
      config: {
        filter: { property: 'status', operator: 'equals', value: 'pending' }
      }
    },
    {
      id: 'by-category',
      name: 'By Category',
      type: 'board',
      config: {
        groupBy: 'categoryId',
        showSummary: true
      }
    },
    {
      id: 'my-expenses',
      name: 'My Expenses',
      type: 'table',
      config: {
        filter: { property: 'submittedBy', operator: 'equals', value: '{{currentUser}}' }
      }
    }
  ]
}

// modules/finance/src/databases/budgets.ts

export const budgetsDatabase: DatabaseTemplate = {
  id: 'finance:budgets',
  name: 'Budgets',
  icon: 'pie-chart',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'categoryId', name: 'Category', type: 'relation', target: 'finance:expenseCategories' },
    {
      id: 'period',
      name: 'Period',
      type: 'select',
      options: [
        { id: 'monthly', name: 'Monthly' },
        { id: 'quarterly', name: 'Quarterly' },
        { id: 'annual', name: 'Annual' }
      ]
    },
    { id: 'year', name: 'Year', type: 'number' },
    { id: 'month', name: 'Month', type: 'number' }, // 1-12, null for annual
    { id: 'quarter', name: 'Quarter', type: 'number' }, // 1-4, null for monthly/annual

    // Amounts
    { id: 'budgetAmount', name: 'Budget', type: 'number', format: 'currency' },
    { id: 'spentAmount', name: 'Spent', type: 'number', format: 'currency', default: 0 },
    {
      id: 'remainingAmount',
      name: 'Remaining',
      type: 'formula',
      formula: 'budgetAmount - spentAmount'
    },
    {
      id: 'percentUsed',
      name: '% Used',
      type: 'formula',
      formula: 'budgetAmount > 0 ? (spentAmount / budgetAmount * 100) : 0'
    },

    // Status
    {
      id: 'status',
      name: 'Status',
      type: 'formula',
      formula: `
      percentUsed >= 100 ? "overspent" :
      percentUsed >= 90 ? "warning" :
      percentUsed >= 75 ? "on-track" :
      "under-budget"
    `
    },

    // Alerts
    { id: 'alertThreshold', name: 'Alert Threshold %', type: 'number', default: 90 },
    { id: 'alertSent', name: 'Alert Sent', type: 'checkbox' },

    // Owner
    { id: 'owner', name: 'Owner', type: 'person' },
    { id: 'notes', name: 'Notes', type: 'text' }
  ],
  views: [
    {
      id: 'current',
      name: 'Current Period',
      type: 'table',
      config: {
        filter: {
          and: [
            { property: 'year', operator: 'equals', value: '{{currentYear}}' },
            { property: 'month', operator: 'equals', value: '{{currentMonth}}' }
          ]
        }
      }
    },
    {
      id: 'by-category',
      name: 'By Category',
      type: 'board',
      config: {
        groupBy: 'categoryId'
      }
    }
  ]
}
```

## Invoice Service

```typescript
// modules/finance/src/services/InvoiceService.ts

import { DatabaseManager } from '@xnet/database'
import { PDFGenerator } from './PDFGenerator'

export class InvoiceService {
  constructor(
    private databaseManager: DatabaseManager,
    private pdfGenerator: PDFGenerator
  ) {}

  // Create a new invoice
  async createInvoice(params: {
    customerId: string
    items: InvoiceItem[]
    issueDate?: number
    dueDate?: number
    notes?: string
    terms?: string
  }): Promise<Invoice> {
    const invoices = await this.databaseManager.getDatabase('finance:invoices')
    const items = await this.databaseManager.getDatabase('finance:invoiceItems')
    const settings = await this.getSettings()

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber()

    // Calculate totals
    const subtotal = params.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const taxAmount = subtotal * (settings.taxRate / 100)

    // Create invoice
    const invoice = await invoices.createRecord({
      invoiceNumber,
      customerId: params.customerId,
      status: 'draft',
      issueDate: params.issueDate || Date.now(),
      dueDate: params.dueDate || Date.now() + settings.paymentTerms * 24 * 60 * 60 * 1000,
      subtotal,
      taxAmount,
      discount: 0,
      amountPaid: 0,
      currency: settings.currency,
      notes: params.notes,
      terms: params.terms || settings.defaultTerms,
      createdBy: await this.getCurrentUserId()
    })

    // Create line items
    for (const item of params.items) {
      await items.createRecord({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || settings.taxRate,
        amount: item.quantity * item.unitPrice
      })
    }

    return invoice
  }

  // Send invoice to customer
  async sendInvoice(
    invoiceId: string,
    options?: {
      to?: string[]
      cc?: string[]
      message?: string
    }
  ): Promise<void> {
    const invoices = await this.databaseManager.getDatabase('finance:invoices')
    const invoice = await invoices.getRecord(invoiceId)

    if (!invoice) {
      throw new Error('Invoice not found')
    }

    // Generate PDF
    const pdfBlob = await this.generatePDF(invoiceId)

    // Get customer email
    const customer = await this.getCustomer(invoice.customerId)
    const recipients = options?.to || [customer.email]

    // Send email with PDF attachment
    await this.sendEmail({
      to: recipients,
      cc: options?.cc,
      subject: `Invoice ${invoice.invoiceNumber} from ${this.getCompanyName()}`,
      body: options?.message || this.getDefaultEmailBody(invoice),
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: pdfBlob
        }
      ]
    })

    // Update invoice status
    await invoices.updateRecord(invoiceId, {
      status: 'sent',
      sentAt: Date.now()
    })
  }

  // Record a payment
  async recordPayment(params: {
    invoiceId: string
    amount: number
    paymentDate?: number
    paymentMethod?: string
    reference?: string
    notes?: string
  }): Promise<void> {
    const invoices = await this.databaseManager.getDatabase('finance:invoices')
    const transactions = await this.databaseManager.getDatabase('finance:transactions')
    const invoice = await invoices.getRecord(params.invoiceId)

    if (!invoice) {
      throw new Error('Invoice not found')
    }

    const newAmountPaid = invoice.amountPaid + params.amount
    const balanceDue = invoice.total - newAmountPaid

    // Update invoice
    await invoices.updateRecord(params.invoiceId, {
      amountPaid: newAmountPaid,
      status: balanceDue <= 0 ? 'paid' : 'partial',
      paidDate: balanceDue <= 0 ? Date.now() : invoice.paidDate
    })

    // Create transaction record
    await transactions.createRecord({
      type: 'income',
      description: `Payment for Invoice ${invoice.invoiceNumber}`,
      amount: params.amount,
      date: params.paymentDate || Date.now(),
      accountId: await this.getDefaultAccountId(),
      reference: params.reference,
      invoiceId: params.invoiceId,
      notes: params.notes
    })
  }

  // Generate invoice PDF
  async generatePDF(invoiceId: string): Promise<Blob> {
    const invoices = await this.databaseManager.getDatabase('finance:invoices')
    const items = await this.databaseManager.getDatabase('finance:invoiceItems')

    const invoice = await invoices.getRecord(invoiceId)
    const lineItems = await items
      .query()
      .filter({ property: 'invoiceId', operator: 'equals', value: invoiceId })
      .execute()

    const customer = await this.getCustomer(invoice.customerId)
    const settings = await this.getSettings()

    return this.pdfGenerator.generateInvoice({
      invoice,
      items: lineItems.records,
      customer,
      company: settings.companyInfo
    })
  }

  // Check for overdue invoices
  async checkOverdueInvoices(): Promise<Invoice[]> {
    const invoices = await this.databaseManager.getDatabase('finance:invoices')

    const overdue = await invoices
      .query()
      .filter({
        and: [
          { property: 'status', operator: 'in', value: ['sent', 'viewed', 'partial'] },
          { property: 'dueDate', operator: 'is_before', value: Date.now() }
        ]
      })
      .execute()

    // Update status to overdue
    for (const invoice of overdue.records) {
      if (invoice.status !== 'overdue') {
        await invoices.updateRecord(invoice.id, { status: 'overdue' })
      }
    }

    return overdue.records
  }

  private async generateInvoiceNumber(): Promise<string> {
    const settings = await this.getSettings()
    const invoices = await this.databaseManager.getDatabase('finance:invoices')

    // Get latest invoice number
    const latest = await invoices.query().sort('invoiceNumber', 'desc').limit(1).first()

    const lastNumber = latest
      ? parseInt(latest.invoiceNumber.replace(settings.invoicePrefix, '')) || 0
      : 0

    return `${settings.invoicePrefix}${String(lastNumber + 1).padStart(6, '0')}`
  }
}

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate?: number
}
```

## PDF Generator

```typescript
// modules/finance/src/services/PDFGenerator.ts

import jsPDF from 'jspdf'

export class PDFGenerator {
  async generateInvoice(data: {
    invoice: Invoice
    items: InvoiceItem[]
    customer: Customer
    company: CompanyInfo
  }): Promise<Blob> {
    const { invoice, items, customer, company } = data
    const doc = new jsPDF()

    // Company Header
    doc.setFontSize(20)
    doc.text(company.name, 20, 20)

    doc.setFontSize(10)
    doc.text(company.address || '', 20, 30)
    doc.text(`${company.city || ''} ${company.postalCode || ''}`, 20, 35)
    doc.text(company.phone || '', 20, 40)
    doc.text(company.email || '', 20, 45)

    // Invoice Title
    doc.setFontSize(24)
    doc.text('INVOICE', 150, 20)

    doc.setFontSize(10)
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 150, 30)
    doc.text(`Date: ${this.formatDate(invoice.issueDate)}`, 150, 35)
    doc.text(`Due Date: ${this.formatDate(invoice.dueDate)}`, 150, 40)

    // Bill To
    doc.setFontSize(12)
    doc.text('Bill To:', 20, 60)
    doc.setFontSize(10)
    doc.text(customer.name, 20, 68)
    doc.text(customer.address || '', 20, 73)
    doc.text(`${customer.city || ''} ${customer.postalCode || ''}`, 20, 78)

    // Items Table
    let y = 100

    // Header
    doc.setFillColor(240, 240, 240)
    doc.rect(20, y - 5, 170, 10, 'F')
    doc.setFontSize(10)
    doc.text('Description', 22, y)
    doc.text('Qty', 100, y)
    doc.text('Unit Price', 120, y)
    doc.text('Amount', 160, y)

    y += 10

    // Items
    for (const item of items) {
      doc.text(item.description.substring(0, 40), 22, y)
      doc.text(String(item.quantity), 100, y)
      doc.text(this.formatCurrency(item.unitPrice), 120, y)
      doc.text(this.formatCurrency(item.amount), 160, y)
      y += 8
    }

    // Totals
    y += 10
    doc.line(120, y, 190, y)
    y += 8

    doc.text('Subtotal:', 130, y)
    doc.text(this.formatCurrency(invoice.subtotal), 160, y)
    y += 8

    if (invoice.taxAmount > 0) {
      doc.text('Tax:', 130, y)
      doc.text(this.formatCurrency(invoice.taxAmount), 160, y)
      y += 8
    }

    if (invoice.discount > 0) {
      doc.text('Discount:', 130, y)
      doc.text(`-${this.formatCurrency(invoice.discount)}`, 160, y)
      y += 8
    }

    doc.setFontSize(12)
    doc.text('Total:', 130, y)
    doc.text(this.formatCurrency(invoice.total), 160, y)

    // Payment Info
    if (invoice.amountPaid > 0) {
      y += 10
      doc.setFontSize(10)
      doc.text(`Amount Paid: ${this.formatCurrency(invoice.amountPaid)}`, 130, y)
      y += 8
      doc.setFontSize(12)
      doc.text(`Balance Due: ${this.formatCurrency(invoice.balanceDue)}`, 130, y)
    }

    // Notes
    if (invoice.notes) {
      y = 220
      doc.setFontSize(10)
      doc.text('Notes:', 20, y)
      doc.setFontSize(9)
      const notes = doc.splitTextToSize(invoice.notes, 170)
      doc.text(notes, 20, y + 8)
    }

    // Terms
    if (invoice.terms) {
      y = 250
      doc.setFontSize(10)
      doc.text('Terms & Conditions:', 20, y)
      doc.setFontSize(8)
      const terms = doc.splitTextToSize(invoice.terms, 170)
      doc.text(terms, 20, y + 8)
    }

    // Footer
    doc.setFontSize(8)
    doc.text('Thank you for your business!', 105, 285, { align: 'center' })

    return doc.output('blob')
  }

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString()
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }
}
```

## Workflows

```typescript
// modules/finance/src/workflows/invoiceOverdue.ts

export const invoiceOverdueWorkflow: WorkflowTemplate = {
  id: 'finance:invoice-overdue',
  name: 'Invoice Overdue',
  description: 'Notifications and actions for overdue invoices',

  trigger: {
    type: 'schedule',
    config: {
      cron: '0 9 * * *' // Daily at 9 AM
    }
  },

  actions: [
    // Find overdue invoices
    {
      id: 'find-overdue',
      type: 'query',
      config: {
        databaseId: 'finance:invoices',
        filter: {
          and: [
            { property: 'status', operator: 'in', value: ['sent', 'viewed', 'partial'] },
            { property: 'dueDate', operator: 'is_before', value: '{{now}}' }
          ]
        }
      },
      output: 'overdueInvoices'
    },
    // Update status and notify
    {
      id: 'process-overdue',
      type: 'foreach',
      config: {
        items: '{{overdueInvoices}}',
        actions: [
          // Update status
          {
            type: 'update_record',
            config: {
              databaseId: 'finance:invoices',
              recordId: '{{item.id}}',
              data: { status: 'overdue' }
            }
          },
          // Notify internal team
          {
            type: 'notification',
            config: {
              role: 'finance',
              title: 'Invoice Overdue',
              message:
                'Invoice {{item.invoiceNumber}} is {{item.daysOverdue}} days overdue ({{item.balanceDue | currency}})'
            }
          },
          // Send reminder email (if configured)
          {
            type: 'conditional',
            config: {
              condition: '{{settings.sendOverdueReminders}}',
              then: [
                {
                  type: 'email',
                  config: {
                    to: '{{item.customerId.email}}',
                    template: 'invoice-overdue-reminder',
                    data: {
                      invoiceNumber: '{{item.invoiceNumber}}',
                      amount: '{{item.balanceDue}}',
                      daysOverdue: '{{item.daysOverdue}}'
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}

// modules/finance/src/workflows/expenseApproval.ts

export const expenseApprovalWorkflow: WorkflowTemplate = {
  id: 'finance:expense-approval',
  name: 'Expense Approval',
  description: 'Route expenses for approval',

  trigger: {
    type: 'record_create',
    config: {
      databaseId: 'finance:expenses'
    }
  },

  conditions: [{ field: 'record.status', operator: 'equals', value: 'pending' }],

  actions: [
    // Determine approver based on amount
    {
      id: 'get-approver',
      type: 'script',
      config: {
        code: `
          const amount = context.record.amount;
          if (amount > 5000) {
            return { approver: 'finance-director' };
          } else if (amount > 1000) {
            return { approver: 'finance-manager' };
          } else {
            return { approver: context.record.submittedBy.managerId };
          }
        `
      },
      output: 'approverInfo'
    },
    // Notify approver
    {
      id: 'notify-approver',
      type: 'notification',
      config: {
        userId: '{{approverInfo.approver}}',
        title: 'Expense Approval Required',
        message:
          '{{record.submittedBy.name}} submitted an expense for {{record.amount | currency}}',
        actions: [
          { label: 'Approve', action: 'approve_expense', data: { id: '{{record.id}}' } },
          { label: 'Reject', action: 'reject_expense', data: { id: '{{record.id}}' } }
        ]
      }
    }
  ]
}

// modules/finance/src/workflows/budgetAlert.ts

export const budgetAlertWorkflow: WorkflowTemplate = {
  id: 'finance:budget-alert',
  name: 'Budget Alert',
  description: 'Alert when budget threshold is reached',

  trigger: {
    type: 'property_change',
    config: {
      databaseId: 'finance:budgets',
      property: 'spentAmount'
    }
  },

  conditions: [
    {
      type: 'and',
      conditions: [
        {
          field: 'record.percentUsed',
          operator: 'greater_than_or_equal',
          value: '{{record.alertThreshold}}'
        },
        { field: 'record.alertSent', operator: 'equals', value: false }
      ]
    }
  ],

  actions: [
    // Mark alert as sent
    {
      id: 'mark-alert-sent',
      type: 'update_record',
      config: {
        databaseId: 'finance:budgets',
        recordId: '{{record.id}}',
        data: { alertSent: true }
      }
    },
    // Notify budget owner
    {
      id: 'notify-owner',
      type: 'notification',
      config: {
        userId: '{{record.owner}}',
        title: 'Budget Alert',
        message:
          '{{record.name}} has reached {{record.percentUsed | round}}% of budget ({{record.remainingAmount | currency}} remaining)',
        priority: 'high'
      }
    }
  ]
}
```

## File Structure

```
modules/finance/
├── src/
│   ├── index.ts
│   ├── module.ts
│   ├── databases/
│   │   ├── invoices.ts
│   │   ├── invoiceItems.ts
│   │   ├── expenses.ts
│   │   ├── expenseCategories.ts
│   │   ├── budgets.ts
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   └── taxRates.ts
│   ├── components/
│   │   ├── pages/
│   │   │   ├── InvoicesPage.tsx
│   │   │   ├── ExpensesPage.tsx
│   │   │   ├── BudgetsPage.tsx
│   │   │   ├── AccountsPage.tsx
│   │   │   └── FinanceReportsPage.tsx
│   │   ├── InvoiceForm.tsx
│   │   ├── InvoicePreview.tsx
│   │   ├── ExpenseForm.tsx
│   │   ├── BudgetTracker.tsx
│   │   └── PaymentForm.tsx
│   ├── widgets/
│   │   ├── RevenueWidget.tsx
│   │   ├── ExpensesSummaryWidget.tsx
│   │   ├── CashFlowWidget.tsx
│   │   ├── OutstandingInvoicesWidget.tsx
│   │   └── BudgetStatusWidget.tsx
│   ├── services/
│   │   ├── InvoiceService.ts
│   │   ├── ExpenseService.ts
│   │   ├── BudgetService.ts
│   │   └── PDFGenerator.ts
│   ├── workflows/
│   │   ├── invoiceOverdue.ts
│   │   ├── expenseApproval.ts
│   │   ├── budgetAlert.ts
│   │   └── paymentReceived.ts
│   └── settings/
│       └── FinanceSettings.tsx
├── tests/
│   ├── invoiceService.test.ts
│   ├── expenseService.test.ts
│   ├── budgetService.test.ts
│   └── pdfGenerator.test.ts
└── package.json
```

## Validation Checklist

```markdown
## Finance Module Validation

### Invoices

- [ ] Create invoice with line items
- [ ] Calculate totals correctly
- [ ] Generate PDF invoice
- [ ] Send invoice by email
- [ ] Record partial payment
- [ ] Record full payment
- [ ] Mark as overdue automatically

### Expenses

- [ ] Submit expense with receipt
- [ ] Approval workflow triggers
- [ ] Approve/reject expense
- [ ] Expense categories work
- [ ] Link expense to project

### Budgets

- [ ] Create budget for category
- [ ] Track spending against budget
- [ ] Budget alert at threshold
- [ ] View budget status
- [ ] Monthly/quarterly/annual budgets

### Transactions

- [ ] Record income transaction
- [ ] Record expense transaction
- [ ] View transaction history
- [ ] Account balances correct

### Reports

- [ ] Revenue report
- [ ] Expense report by category
- [ ] Cash flow report
- [ ] Profit & loss summary
- [ ] Budget vs actual report

### Workflows

- [ ] Overdue invoice notifications
- [ ] Expense approval routing
- [ ] Budget threshold alerts
- [ ] Payment confirmation
```

---

[← Back to Inventory Module](./07-inventory-module.md) | [Next: API Gateway →](./09-api-gateway.md)
