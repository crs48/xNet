/**
 * Built-in database templates.
 *
 * Provides ready-to-use templates for common use cases:
 * - Project Tracker
 * - Task List
 * - CRM Contacts
 * - Inventory Tracker
 * - Content Calendar
 * - Reading List
 * - Expense Tracker
 * - Course Planner
 */

import type { DatabaseTemplate, TemplateCategory } from './types'

// ─── Built-in Templates ───────────────────────────────────────────────────────

export const BUILTIN_TEMPLATES: DatabaseTemplate[] = [
  // ─── Project Management ────────────────────────────────────────
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Track projects with status, priority, and deadlines',
    icon: '📋',
    category: 'project-management',
    columns: [
      { id: 'title', name: 'Project', type: 'text', config: {}, isTitle: true },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'not-started', name: 'Not Started', color: 'gray' },
            { id: 'in-progress', name: 'In Progress', color: 'blue' },
            { id: 'review', name: 'In Review', color: 'yellow' },
            { id: 'completed', name: 'Completed', color: 'green' }
          ]
        }
      },
      {
        id: 'priority',
        name: 'Priority',
        type: 'select',
        config: {
          options: [
            { id: 'low', name: 'Low', color: 'gray' },
            { id: 'medium', name: 'Medium', color: 'yellow' },
            { id: 'high', name: 'High', color: 'orange' },
            { id: 'urgent', name: 'Urgent', color: 'red' }
          ]
        }
      },
      { id: 'assignee', name: 'Assignee', type: 'person', config: {} },
      { id: 'due-date', name: 'Due Date', type: 'date', config: {} },
      { id: 'progress', name: 'Progress', type: 'number', config: { format: 'percent' } },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'table',
        name: 'All Projects',
        type: 'table',
        visibleColumns: ['title', 'status', 'priority', 'assignee', 'due-date', 'progress']
      },
      {
        id: 'board',
        name: 'Kanban Board',
        type: 'board',
        visibleColumns: ['title', 'priority', 'assignee', 'due-date'],
        groupBy: 'status'
      },
      {
        id: 'timeline',
        name: 'Timeline',
        type: 'timeline',
        visibleColumns: ['title', 'status', 'assignee']
      }
    ],
    sampleData: [
      {
        cells: {
          title: 'Website Redesign',
          status: 'in-progress',
          priority: 'high',
          'due-date': '2024-03-15',
          progress: 60
        }
      },
      {
        cells: {
          title: 'Mobile App MVP',
          status: 'not-started',
          priority: 'medium',
          'due-date': '2024-04-01',
          progress: 0
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['project', 'tasks', 'kanban', 'timeline']
    }
  },

  {
    id: 'task-list',
    name: 'Task List',
    description: 'Simple task list with checkboxes and due dates',
    icon: '✅',
    category: 'project-management',
    columns: [
      { id: 'task', name: 'Task', type: 'text', config: {}, isTitle: true },
      { id: 'done', name: 'Done', type: 'checkbox', config: {} },
      { id: 'due', name: 'Due', type: 'date', config: {} },
      {
        id: 'priority',
        name: 'Priority',
        type: 'select',
        config: {
          options: [
            { id: 'low', name: 'Low', color: 'gray' },
            { id: 'medium', name: 'Medium', color: 'yellow' },
            { id: 'high', name: 'High', color: 'red' }
          ]
        }
      },
      {
        id: 'tags',
        name: 'Tags',
        type: 'multiSelect',
        config: {
          options: [
            { id: 'work', name: 'Work', color: 'blue' },
            { id: 'personal', name: 'Personal', color: 'green' },
            { id: 'urgent', name: 'Urgent', color: 'red' }
          ]
        }
      }
    ],
    views: [
      {
        id: 'all',
        name: 'All Tasks',
        type: 'table',
        visibleColumns: ['task', 'done', 'due', 'priority', 'tags']
      },
      {
        id: 'active',
        name: 'Active',
        type: 'table',
        visibleColumns: ['task', 'due', 'priority', 'tags'],
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'done', operator: 'equals', value: false }]
        }
      }
    ],
    sampleData: [
      { cells: { task: 'Review project proposal', done: false, priority: 'high' } },
      { cells: { task: 'Send weekly report', done: true, priority: 'medium' } }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['tasks', 'todo', 'checklist']
    }
  },

  // ─── CRM ────────────────────────────────────────────────────────
  {
    id: 'crm-contacts',
    name: 'CRM Contacts',
    description: 'Manage customer contacts and relationships',
    icon: '👥',
    category: 'crm',
    columns: [
      { id: 'name', name: 'Name', type: 'text', config: {}, isTitle: true },
      { id: 'email', name: 'Email', type: 'email', config: {} },
      { id: 'phone', name: 'Phone', type: 'phone', config: {} },
      { id: 'company', name: 'Company', type: 'text', config: {} },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'lead', name: 'Lead', color: 'gray' },
            { id: 'prospect', name: 'Prospect', color: 'blue' },
            { id: 'customer', name: 'Customer', color: 'green' },
            { id: 'churned', name: 'Churned', color: 'red' }
          ]
        }
      },
      { id: 'value', name: 'Deal Value', type: 'number', config: { format: 'currency' } },
      { id: 'last-contact', name: 'Last Contact', type: 'date', config: {} },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'all',
        name: 'All Contacts',
        type: 'table',
        visibleColumns: ['name', 'email', 'company', 'status', 'value', 'last-contact']
      },
      {
        id: 'pipeline',
        name: 'Sales Pipeline',
        type: 'board',
        visibleColumns: ['name', 'company', 'value'],
        groupBy: 'status'
      }
    ],
    sampleData: [
      {
        cells: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          company: 'Acme Corp',
          status: 'prospect',
          value: 5000
        }
      },
      {
        cells: {
          name: 'John Doe',
          email: 'john@example.com',
          company: 'Tech Inc',
          status: 'customer',
          value: 12000
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['crm', 'sales', 'contacts', 'customers']
    }
  },

  // ─── Inventory ──────────────────────────────────────────────────
  {
    id: 'inventory',
    name: 'Inventory Tracker',
    description: 'Track products, stock levels, and suppliers',
    icon: '📦',
    category: 'inventory',
    columns: [
      { id: 'product', name: 'Product', type: 'text', config: {}, isTitle: true },
      { id: 'sku', name: 'SKU', type: 'text', config: {} },
      {
        id: 'category',
        name: 'Category',
        type: 'select',
        config: {
          options: [
            { id: 'electronics', name: 'Electronics', color: 'blue' },
            { id: 'clothing', name: 'Clothing', color: 'purple' },
            { id: 'food', name: 'Food & Beverage', color: 'green' },
            { id: 'other', name: 'Other', color: 'gray' }
          ]
        }
      },
      { id: 'quantity', name: 'In Stock', type: 'number', config: {} },
      { id: 'reorder', name: 'Reorder Level', type: 'number', config: {} },
      { id: 'cost', name: 'Unit Cost', type: 'number', config: { format: 'currency' } },
      { id: 'price', name: 'Sale Price', type: 'number', config: { format: 'currency' } },
      { id: 'supplier', name: 'Supplier', type: 'text', config: {} },
      { id: 'location', name: 'Location', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'all',
        name: 'All Products',
        type: 'table',
        visibleColumns: ['product', 'sku', 'category', 'quantity', 'cost', 'price']
      },
      {
        id: 'by-category',
        name: 'By Category',
        type: 'table',
        visibleColumns: ['product', 'quantity', 'price'],
        groupBy: 'category'
      }
    ],
    sampleData: [
      {
        cells: {
          product: 'Wireless Mouse',
          sku: 'WM-001',
          category: 'electronics',
          quantity: 150,
          reorder: 50,
          cost: 15,
          price: 29.99
        }
      },
      {
        cells: {
          product: 'USB-C Cable',
          sku: 'UC-002',
          category: 'electronics',
          quantity: 300,
          reorder: 100,
          cost: 3,
          price: 9.99
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['inventory', 'stock', 'products', 'warehouse']
    }
  },

  // ─── Content ────────────────────────────────────────────────────
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Plan and schedule content across channels',
    icon: '📅',
    category: 'content',
    columns: [
      { id: 'title', name: 'Title', type: 'text', config: {}, isTitle: true },
      {
        id: 'type',
        name: 'Type',
        type: 'select',
        config: {
          options: [
            { id: 'blog', name: 'Blog Post', color: 'blue' },
            { id: 'social', name: 'Social Media', color: 'pink' },
            { id: 'email', name: 'Email', color: 'green' },
            { id: 'video', name: 'Video', color: 'red' }
          ]
        }
      },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'idea', name: 'Idea', color: 'gray' },
            { id: 'drafting', name: 'Drafting', color: 'yellow' },
            { id: 'review', name: 'In Review', color: 'orange' },
            { id: 'scheduled', name: 'Scheduled', color: 'blue' },
            { id: 'published', name: 'Published', color: 'green' }
          ]
        }
      },
      { id: 'author', name: 'Author', type: 'person', config: {} },
      { id: 'publish-date', name: 'Publish Date', type: 'date', config: {} },
      {
        id: 'channels',
        name: 'Channels',
        type: 'multiSelect',
        config: {
          options: [
            { id: 'website', name: 'Website', color: 'blue' },
            { id: 'twitter', name: 'Twitter', color: 'blue' },
            { id: 'linkedin', name: 'LinkedIn', color: 'blue' },
            { id: 'instagram', name: 'Instagram', color: 'pink' }
          ]
        }
      },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'calendar',
        name: 'Calendar',
        type: 'calendar',
        visibleColumns: ['title', 'type', 'status']
      },
      {
        id: 'board',
        name: 'Workflow',
        type: 'board',
        visibleColumns: ['title', 'type', 'author', 'publish-date'],
        groupBy: 'status'
      },
      {
        id: 'all',
        name: 'All Content',
        type: 'table',
        visibleColumns: ['title', 'type', 'status', 'author', 'publish-date', 'channels']
      }
    ],
    sampleData: [
      {
        cells: {
          title: 'Product Launch Announcement',
          type: 'blog',
          status: 'drafting',
          'publish-date': '2024-02-15',
          channels: ['website', 'twitter']
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['content', 'calendar', 'marketing', 'social']
    }
  },

  // ─── Personal ───────────────────────────────────────────────────
  {
    id: 'reading-list',
    name: 'Reading List',
    description: 'Track books and articles to read',
    icon: '📚',
    category: 'personal',
    columns: [
      { id: 'title', name: 'Title', type: 'text', config: {}, isTitle: true },
      { id: 'author', name: 'Author', type: 'text', config: {} },
      {
        id: 'type',
        name: 'Type',
        type: 'select',
        config: {
          options: [
            { id: 'book', name: 'Book', color: 'blue' },
            { id: 'article', name: 'Article', color: 'green' },
            { id: 'paper', name: 'Paper', color: 'purple' }
          ]
        }
      },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'to-read', name: 'To Read', color: 'gray' },
            { id: 'reading', name: 'Reading', color: 'blue' },
            { id: 'finished', name: 'Finished', color: 'green' },
            { id: 'abandoned', name: 'Abandoned', color: 'red' }
          ]
        }
      },
      { id: 'rating', name: 'Rating', type: 'number', config: { min: 1, max: 5 } },
      { id: 'url', name: 'Link', type: 'url', config: {} },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'all',
        name: 'All Items',
        type: 'table',
        visibleColumns: ['title', 'author', 'type', 'status', 'rating']
      },
      {
        id: 'to-read',
        name: 'To Read',
        type: 'gallery',
        visibleColumns: ['title', 'author', 'type'],
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'status', operator: 'equals', value: 'to-read' }]
        }
      }
    ],
    sampleData: [
      {
        cells: {
          title: 'The Pragmatic Programmer',
          author: 'David Thomas, Andrew Hunt',
          type: 'book',
          status: 'reading',
          rating: 5
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['reading', 'books', 'articles', 'personal']
    }
  },

  // ─── Finance ────────────────────────────────────────────────────
  {
    id: 'expense-tracker',
    name: 'Expense Tracker',
    description: 'Track expenses and budgets',
    icon: '💰',
    category: 'finance',
    columns: [
      { id: 'description', name: 'Description', type: 'text', config: {}, isTitle: true },
      { id: 'amount', name: 'Amount', type: 'number', config: { format: 'currency' } },
      { id: 'date', name: 'Date', type: 'date', config: {} },
      {
        id: 'category',
        name: 'Category',
        type: 'select',
        config: {
          options: [
            { id: 'food', name: 'Food & Dining', color: 'orange' },
            { id: 'transport', name: 'Transportation', color: 'blue' },
            { id: 'utilities', name: 'Utilities', color: 'yellow' },
            { id: 'entertainment', name: 'Entertainment', color: 'pink' },
            { id: 'shopping', name: 'Shopping', color: 'purple' },
            { id: 'other', name: 'Other', color: 'gray' }
          ]
        }
      },
      {
        id: 'payment',
        name: 'Payment Method',
        type: 'select',
        config: {
          options: [
            { id: 'cash', name: 'Cash', color: 'green' },
            { id: 'credit', name: 'Credit Card', color: 'blue' },
            { id: 'debit', name: 'Debit Card', color: 'blue' }
          ]
        }
      },
      { id: 'receipt', name: 'Receipt', type: 'file', config: {} },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'all',
        name: 'All Expenses',
        type: 'table',
        visibleColumns: ['description', 'amount', 'date', 'category', 'payment'],
        sorts: [{ columnId: 'date', direction: 'desc' }]
      },
      {
        id: 'by-category',
        name: 'By Category',
        type: 'table',
        visibleColumns: ['description', 'amount', 'date'],
        groupBy: 'category'
      }
    ],
    sampleData: [
      {
        cells: {
          description: 'Grocery shopping',
          amount: 85.5,
          date: '2024-01-15',
          category: 'food',
          payment: 'debit'
        }
      },
      {
        cells: {
          description: 'Monthly transit pass',
          amount: 120,
          date: '2024-01-01',
          category: 'transport',
          payment: 'credit'
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['expenses', 'budget', 'finance', 'money']
    }
  },

  // ─── Education ──────────────────────────────────────────────────
  {
    id: 'course-planner',
    name: 'Course Planner',
    description: 'Plan and track course content and assignments',
    icon: '🎓',
    category: 'education',
    columns: [
      { id: 'topic', name: 'Topic', type: 'text', config: {}, isTitle: true },
      { id: 'week', name: 'Week', type: 'number', config: {} },
      {
        id: 'type',
        name: 'Type',
        type: 'select',
        config: {
          options: [
            { id: 'lecture', name: 'Lecture', color: 'blue' },
            { id: 'lab', name: 'Lab', color: 'green' },
            { id: 'assignment', name: 'Assignment', color: 'orange' },
            { id: 'exam', name: 'Exam', color: 'red' }
          ]
        }
      },
      { id: 'date', name: 'Date', type: 'date', config: {} },
      { id: 'completed', name: 'Completed', type: 'checkbox', config: {} },
      { id: 'materials', name: 'Materials', type: 'url', config: {} },
      { id: 'notes', name: 'Notes', type: 'text', config: {} }
    ],
    views: [
      {
        id: 'timeline',
        name: 'Schedule',
        type: 'table',
        visibleColumns: ['topic', 'week', 'type', 'date', 'completed'],
        sorts: [{ columnId: 'week', direction: 'asc' }]
      },
      {
        id: 'calendar',
        name: 'Calendar',
        type: 'calendar',
        visibleColumns: ['topic', 'type']
      }
    ],
    sampleData: [
      {
        cells: {
          topic: 'Introduction to Programming',
          week: 1,
          type: 'lecture',
          date: '2024-01-08',
          completed: true
        }
      },
      {
        cells: {
          topic: 'Variables and Data Types',
          week: 2,
          type: 'lecture',
          date: '2024-01-15',
          completed: false
        }
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: ['education', 'course', 'syllabus', 'teaching']
    }
  }
]

// ─── Template Utilities ───────────────────────────────────────────────────────

/**
 * Get templates by category.
 */
export function getTemplatesByCategory(category: TemplateCategory): DatabaseTemplate[] {
  return BUILTIN_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Search templates by name, description, or tags.
 */
export function searchTemplates(query: string): DatabaseTemplate[] {
  const lower = query.toLowerCase()
  return BUILTIN_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.metadata.tags.some((tag) => tag.includes(lower))
  )
}

/**
 * Get a template by ID.
 */
export function getTemplateById(id: string): DatabaseTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id)
}

/**
 * Get all template categories with counts.
 */
export function getTemplateCategoryCounts(): Record<TemplateCategory, number> {
  const counts: Record<TemplateCategory, number> = {
    'project-management': 0,
    crm: 0,
    inventory: 0,
    content: 0,
    personal: 0,
    education: 0,
    finance: 0,
    custom: 0
  }

  for (const template of BUILTIN_TEMPLATES) {
    counts[template.category]++
  }

  return counts
}
