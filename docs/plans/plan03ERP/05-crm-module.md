# 05: CRM Module

> Customer Relationship Management with contacts, companies, deals, and pipeline

**Package:** `modules/@xnetjs/crm`
**Dependencies:** `@xnetjs/modules`, `@xnetjs/workflows`, `@xnetjs/dashboard`, `@xnetjs/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - CRM entities (Contact, Company, Deal) defined as Schemas via `defineSchema()`
> - All CRM data stored as Nodes in NodeStore
> - Use `useNodes({ schemaId: 'xnet://crm/Contact' })` for queries

## Goals

- Complete contact and company management
- Visual deal pipeline with drag-drop
- Activity tracking and scheduling
- Email integration
- Reporting dashboards

## Module Definition

```typescript
// modules/crm/src/module.ts

import { ModuleDefinition } from '@xnetjs/modules'

export const CRMModule: ModuleDefinition = {
  id: 'mod:crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'Customer Relationship Management',

  dependencies: {
    core: '3.0.0',
    modules: []
  },

  schema: {
    databases: [
      contactsDatabase,
      companiesDatabase,
      dealsDatabase,
      activitiesDatabase,
      pipelinesDatabase
    ],
    relations: [
      { from: 'contacts', to: 'companies', type: 'many-to-one', field: 'companyId' },
      { from: 'deals', to: 'contacts', type: 'many-to-one', field: 'contactId' },
      { from: 'deals', to: 'companies', type: 'many-to-one', field: 'companyId' },
      { from: 'activities', to: 'contacts', type: 'many-to-one', field: 'contactId' },
      { from: 'activities', to: 'deals', type: 'many-to-one', field: 'dealId' }
    ]
  },

  components: {
    pages: [
      { id: 'contacts', name: 'Contacts', component: 'ContactsPage', icon: 'users' },
      { id: 'companies', name: 'Companies', component: 'CompaniesPage', icon: 'building' },
      { id: 'deals', name: 'Deals', component: 'DealsPage', icon: 'dollar-sign' },
      { id: 'pipeline', name: 'Pipeline', component: 'PipelinePage', icon: 'git-branch' },
      { id: 'activities', name: 'Activities', component: 'ActivitiesPage', icon: 'calendar' },
      { id: 'reports', name: 'Reports', component: 'ReportsPage', icon: 'bar-chart' }
    ],
    widgets: [
      { id: 'deal-value', name: 'Total Deal Value', component: 'DealValueWidget' },
      { id: 'pipeline-funnel', name: 'Pipeline Funnel', component: 'PipelineFunnelWidget' },
      { id: 'activity-feed', name: 'Recent Activities', component: 'ActivityFeedWidget' },
      { id: 'top-deals', name: 'Top Deals', component: 'TopDealsWidget' },
      { id: 'conversion-rate', name: 'Conversion Rate', component: 'ConversionRateWidget' }
    ],
    actions: [
      { id: 'create-contact', name: 'Create Contact', handler: 'createContact' },
      { id: 'create-deal', name: 'Create Deal', handler: 'createDeal' },
      { id: 'log-activity', name: 'Log Activity', handler: 'logActivity' },
      { id: 'send-email', name: 'Send Email', handler: 'sendEmail' }
    ]
  },

  workflows: [dealStageChangeWorkflow, newLeadWorkflow, activityReminderWorkflow, dealWonWorkflow],

  settings: [
    {
      id: 'defaultPipeline',
      label: 'Default Pipeline',
      type: 'select',
      default: null
    },
    {
      id: 'dealRotting',
      label: 'Deal Rotting Days',
      description: 'Days before a deal is marked as rotting',
      type: 'number',
      default: 14
    },
    {
      id: 'emailIntegration',
      label: 'Email Integration',
      type: 'boolean',
      default: false
    }
  ],

  hooks: {
    onInstall: async (context) => {
      // Create default pipeline
      await context.databases.get('pipelines').createRecord({
        name: 'Sales Pipeline',
        stages: defaultPipelineStages,
        isDefault: true
      })
    }
  }
}

const defaultPipelineStages = [
  { id: 'lead', name: 'Lead', order: 0, probability: 10 },
  { id: 'qualified', name: 'Qualified', order: 1, probability: 25 },
  { id: 'proposal', name: 'Proposal', order: 2, probability: 50 },
  { id: 'negotiation', name: 'Negotiation', order: 3, probability: 75 },
  { id: 'won', name: 'Won', order: 4, probability: 100, isWon: true },
  { id: 'lost', name: 'Lost', order: 5, probability: 0, isLost: true }
]
```

## Database Schemas

```typescript
// modules/crm/src/databases/contacts.ts

export const contactsDatabase: DatabaseTemplate = {
  id: 'crm:contacts',
  name: 'Contacts',
  icon: 'user',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'email', name: 'Email', type: 'email' },
    { id: 'phone', name: 'Phone', type: 'phone' },
    { id: 'companyId', name: 'Company', type: 'relation', target: 'crm:companies' },
    { id: 'title', name: 'Job Title', type: 'text' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'lead', name: 'Lead', color: 'blue' },
        { id: 'prospect', name: 'Prospect', color: 'yellow' },
        { id: 'customer', name: 'Customer', color: 'green' },
        { id: 'churned', name: 'Churned', color: 'red' }
      ]
    },
    {
      id: 'source',
      name: 'Source',
      type: 'select',
      options: [
        { id: 'website', name: 'Website' },
        { id: 'referral', name: 'Referral' },
        { id: 'linkedin', name: 'LinkedIn' },
        { id: 'cold-outreach', name: 'Cold Outreach' },
        { id: 'event', name: 'Event' },
        { id: 'other', name: 'Other' }
      ]
    },
    { id: 'owner', name: 'Owner', type: 'person' },
    { id: 'tags', name: 'Tags', type: 'multi_select' },
    { id: 'lastActivity', name: 'Last Activity', type: 'date' },
    { id: 'notes', name: 'Notes', type: 'rich_text' },
    { id: 'avatar', name: 'Avatar', type: 'file', fileTypes: ['image'] },
    { id: 'social', name: 'Social Links', type: 'json' },
    { id: 'customFields', name: 'Custom Fields', type: 'json' }
  ],
  views: [
    {
      id: 'all',
      name: 'All Contacts',
      type: 'table',
      config: {
        visibleProperties: ['name', 'email', 'companyId', 'status', 'owner'],
        sorts: [{ property: 'name', direction: 'asc' }]
      }
    },
    {
      id: 'by-status',
      name: 'By Status',
      type: 'board',
      config: {
        groupBy: 'status',
        cardProperties: ['email', 'companyId']
      }
    },
    {
      id: 'my-contacts',
      name: 'My Contacts',
      type: 'table',
      config: {
        filter: { property: 'owner', operator: 'equals', value: '{{currentUser}}' }
      }
    }
  ]
}

// modules/crm/src/databases/companies.ts

export const companiesDatabase: DatabaseTemplate = {
  id: 'crm:companies',
  name: 'Companies',
  icon: 'building',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'domain', name: 'Domain', type: 'url' },
    {
      id: 'industry',
      name: 'Industry',
      type: 'select',
      options: [
        { id: 'technology', name: 'Technology' },
        { id: 'finance', name: 'Finance' },
        { id: 'healthcare', name: 'Healthcare' },
        { id: 'retail', name: 'Retail' },
        { id: 'manufacturing', name: 'Manufacturing' },
        { id: 'services', name: 'Services' },
        { id: 'other', name: 'Other' }
      ]
    },
    {
      id: 'size',
      name: 'Company Size',
      type: 'select',
      options: [
        { id: '1-10', name: '1-10' },
        { id: '11-50', name: '11-50' },
        { id: '51-200', name: '51-200' },
        { id: '201-500', name: '201-500' },
        { id: '501-1000', name: '501-1000' },
        { id: '1000+', name: '1000+' }
      ]
    },
    { id: 'revenue', name: 'Annual Revenue', type: 'number', format: 'currency' },
    { id: 'address', name: 'Address', type: 'text' },
    { id: 'city', name: 'City', type: 'text' },
    { id: 'country', name: 'Country', type: 'text' },
    { id: 'owner', name: 'Account Owner', type: 'person' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'prospect', name: 'Prospect', color: 'blue' },
        { id: 'customer', name: 'Customer', color: 'green' },
        { id: 'partner', name: 'Partner', color: 'purple' },
        { id: 'churned', name: 'Churned', color: 'red' }
      ]
    },
    { id: 'contacts', name: 'Contacts', type: 'rollup', target: 'crm:contacts', function: 'count' },
    { id: 'deals', name: 'Deals', type: 'rollup', target: 'crm:deals', function: 'count' },
    {
      id: 'totalValue',
      name: 'Total Value',
      type: 'rollup',
      target: 'crm:deals',
      property: 'value',
      function: 'sum'
    },
    { id: 'logo', name: 'Logo', type: 'file', fileTypes: ['image'] },
    { id: 'description', name: 'Description', type: 'rich_text' }
  ]
}

// modules/crm/src/databases/deals.ts

export const dealsDatabase: DatabaseTemplate = {
  id: 'crm:deals',
  name: 'Deals',
  icon: 'dollar-sign',
  properties: [
    { id: 'name', name: 'Deal Name', type: 'title' },
    { id: 'value', name: 'Value', type: 'number', format: 'currency' },
    { id: 'pipelineId', name: 'Pipeline', type: 'relation', target: 'crm:pipelines' },
    { id: 'stage', name: 'Stage', type: 'select' }, // Options set from pipeline
    { id: 'probability', name: 'Probability', type: 'number', format: 'percent' },
    {
      id: 'expectedValue',
      name: 'Expected Value',
      type: 'formula',
      formula: 'value * probability / 100'
    },
    { id: 'contactId', name: 'Contact', type: 'relation', target: 'crm:contacts' },
    { id: 'companyId', name: 'Company', type: 'relation', target: 'crm:companies' },
    { id: 'owner', name: 'Owner', type: 'person' },
    { id: 'closeDate', name: 'Expected Close', type: 'date' },
    { id: 'actualCloseDate', name: 'Actual Close', type: 'date' },
    { id: 'source', name: 'Source', type: 'select' },
    {
      id: 'lostReason',
      name: 'Lost Reason',
      type: 'select',
      options: [
        { id: 'price', name: 'Price' },
        { id: 'competitor', name: 'Lost to Competitor' },
        { id: 'no-budget', name: 'No Budget' },
        { id: 'no-decision', name: 'No Decision' },
        { id: 'timing', name: 'Bad Timing' },
        { id: 'other', name: 'Other' }
      ]
    },
    {
      id: 'activities',
      name: 'Activities',
      type: 'rollup',
      target: 'crm:activities',
      function: 'count'
    },
    { id: 'lastActivity', name: 'Last Activity', type: 'date' },
    {
      id: 'daysInStage',
      name: 'Days in Stage',
      type: 'formula',
      formula: 'dateDiff(stageChangedAt, now(), "days")'
    },
    { id: 'stageChangedAt', name: 'Stage Changed', type: 'date' },
    { id: 'isRotting', name: 'Rotting', type: 'formula', formula: 'daysInStage > 14' },
    { id: 'notes', name: 'Notes', type: 'rich_text' },
    { id: 'products', name: 'Products', type: 'json' }
  ],
  views: [
    {
      id: 'pipeline',
      name: 'Pipeline',
      type: 'board',
      config: {
        groupBy: 'stage',
        cardProperties: ['value', 'companyId', 'closeDate'],
        showSummary: true
      }
    },
    {
      id: 'all',
      name: 'All Deals',
      type: 'table',
      config: {
        visibleProperties: ['name', 'value', 'stage', 'companyId', 'owner', 'closeDate']
      }
    },
    {
      id: 'forecast',
      name: 'Forecast',
      type: 'table',
      config: {
        visibleProperties: ['name', 'value', 'probability', 'expectedValue', 'closeDate'],
        filter: { property: 'stage', operator: 'not_equals', value: 'won' }
      }
    },
    {
      id: 'calendar',
      name: 'Close Calendar',
      type: 'calendar',
      config: {
        dateProperty: 'closeDate'
      }
    }
  ]
}

// modules/crm/src/databases/activities.ts

export const activitiesDatabase: DatabaseTemplate = {
  id: 'crm:activities',
  name: 'Activities',
  icon: 'activity',
  properties: [
    { id: 'title', name: 'Title', type: 'title' },
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      options: [
        { id: 'call', name: 'Call', color: 'blue', icon: 'phone' },
        { id: 'email', name: 'Email', color: 'green', icon: 'mail' },
        { id: 'meeting', name: 'Meeting', color: 'purple', icon: 'calendar' },
        { id: 'task', name: 'Task', color: 'yellow', icon: 'check-square' },
        { id: 'note', name: 'Note', color: 'gray', icon: 'file-text' }
      ]
    },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'planned', name: 'Planned', color: 'blue' },
        { id: 'completed', name: 'Completed', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ]
    },
    { id: 'contactId', name: 'Contact', type: 'relation', target: 'crm:contacts' },
    { id: 'dealId', name: 'Deal', type: 'relation', target: 'crm:deals' },
    { id: 'companyId', name: 'Company', type: 'relation', target: 'crm:companies' },
    { id: 'owner', name: 'Owner', type: 'person' },
    { id: 'dueDate', name: 'Due Date', type: 'date' },
    { id: 'completedAt', name: 'Completed At', type: 'date' },
    { id: 'duration', name: 'Duration (min)', type: 'number' },
    { id: 'description', name: 'Description', type: 'rich_text' },
    { id: 'outcome', name: 'Outcome', type: 'text' },
    { id: 'reminder', name: 'Reminder', type: 'date' }
  ],
  views: [
    {
      id: 'upcoming',
      name: 'Upcoming',
      type: 'list',
      config: {
        filter: {
          and: [
            { property: 'status', operator: 'equals', value: 'planned' },
            { property: 'dueDate', operator: 'is_after', value: 'now' }
          ]
        },
        sorts: [{ property: 'dueDate', direction: 'asc' }]
      }
    },
    {
      id: 'calendar',
      name: 'Calendar',
      type: 'calendar',
      config: {
        dateProperty: 'dueDate'
      }
    },
    {
      id: 'completed',
      name: 'Completed',
      type: 'table',
      config: {
        filter: { property: 'status', operator: 'equals', value: 'completed' },
        sorts: [{ property: 'completedAt', direction: 'desc' }]
      }
    }
  ]
}

// modules/crm/src/databases/pipelines.ts

export const pipelinesDatabase: DatabaseTemplate = {
  id: 'crm:pipelines',
  name: 'Pipelines',
  icon: 'git-branch',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'stages', name: 'Stages', type: 'json' },
    { id: 'isDefault', name: 'Default', type: 'checkbox' },
    { id: 'dealCount', name: 'Deals', type: 'rollup', target: 'crm:deals', function: 'count' },
    {
      id: 'totalValue',
      name: 'Total Value',
      type: 'rollup',
      target: 'crm:deals',
      property: 'value',
      function: 'sum'
    }
  ]
}
```

## Pipeline Component

```typescript
// modules/crm/src/components/Pipeline.tsx

import React, { useCallback, useMemo } from 'react'
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core'
import { useDatabase, useRecords } from '@xnetjs/database'
import { formatCurrency } from '@xnetjs/utils'

interface PipelineProps {
  pipelineId: string
}

export function Pipeline({ pipelineId }: PipelineProps) {
  const { database: pipelineDb } = useDatabase('crm:pipelines')
  const { database: dealsDb, updateRecord } = useDatabase('crm:deals')
  const { records: pipelines } = useRecords(pipelineDb)
  const { records: deals, refetch } = useRecords(dealsDb, {
    filter: { property: 'pipelineId', operator: 'equals', value: pipelineId }
  })

  const pipeline = useMemo(() =>
    pipelines.find(p => p.id === pipelineId),
    [pipelines, pipelineId]
  )

  const stages = useMemo(() =>
    (pipeline?.stages || []).sort((a, b) => a.order - b.order),
    [pipeline]
  )

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, typeof deals> = {}
    for (const stage of stages) {
      grouped[stage.id] = deals.filter(d => d.stage === stage.id)
    }
    return grouped
  }, [deals, stages])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const dealId = active.id as string
    const newStageId = over.id as string

    // Update deal stage
    await updateRecord(dealId, {
      stage: newStageId,
      stageChangedAt: Date.now(),
      probability: stages.find(s => s.id === newStageId)?.probability || 0
    })

    refetch()
  }, [updateRecord, stages, refetch])

  if (!pipeline) {
    return <div>Pipeline not found</div>
  }

  return (
    <div className="pipeline">
      <div className="pipeline-header">
        <h2>{pipeline.name}</h2>
        <PipelineSummary deals={deals} stages={stages} />
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="pipeline-columns">
          {stages.filter(s => !s.isLost).map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

function PipelineColumn({
  stage,
  deals
}: {
  stage: PipelineStage
  deals: Deal[]
}) {
  const totalValue = useMemo(() =>
    deals.reduce((sum, d) => sum + (d.value || 0), 0),
    [deals]
  )

  const weightedValue = useMemo(() =>
    deals.reduce((sum, d) => sum + (d.value || 0) * (stage.probability / 100), 0),
    [deals, stage.probability]
  )

  return (
    <div className="pipeline-column">
      <div className="pipeline-column-header">
        <span className="stage-name">{stage.name}</span>
        <span className="stage-count">{deals.length}</span>
      </div>

      <div className="pipeline-column-summary">
        <div className="summary-value">{formatCurrency(totalValue)}</div>
        <div className="summary-weighted">
          Weighted: {formatCurrency(weightedValue)}
        </div>
      </div>

      <DroppableArea id={stage.id}>
        <div className="pipeline-deals">
          {deals.map(deal => (
            <DraggableDealCard key={deal.id} deal={deal} />
          ))}
        </div>
      </DroppableArea>
    </div>
  )
}

function DraggableDealCard({ deal }: { deal: Deal }) {
  const isRotting = deal.daysInStage > 14

  return (
    <DraggableItem id={deal.id}>
      <div className={`deal-card ${isRotting ? 'deal-card--rotting' : ''}`}>
        <div className="deal-card-header">
          <span className="deal-name">{deal.name}</span>
          {isRotting && <span className="rotting-badge">Rotting</span>}
        </div>

        <div className="deal-card-value">
          {formatCurrency(deal.value)}
        </div>

        <div className="deal-card-meta">
          {deal.companyId && (
            <span className="deal-company">
              <CompanyBadge companyId={deal.companyId} />
            </span>
          )}
          {deal.closeDate && (
            <span className="deal-close-date">
              Close: {formatDate(deal.closeDate)}
            </span>
          )}
        </div>

        <div className="deal-card-owner">
          <UserAvatar userId={deal.owner} size="small" />
        </div>
      </div>
    </DraggableItem>
  )
}

function PipelineSummary({
  deals,
  stages
}: {
  deals: Deal[]
  stages: PipelineStage[]
}) {
  const totalValue = useMemo(() =>
    deals.reduce((sum, d) => sum + (d.value || 0), 0),
    [deals]
  )

  const weightedValue = useMemo(() =>
    deals.reduce((sum, d) => {
      const stage = stages.find(s => s.id === d.stage)
      return sum + (d.value || 0) * ((stage?.probability || 0) / 100)
    }, 0),
    [deals, stages]
  )

  const wonDeals = deals.filter(d => stages.find(s => s.id === d.stage)?.isWon)
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div className="pipeline-summary">
      <div className="summary-item">
        <span className="summary-label">Total Pipeline</span>
        <span className="summary-value">{formatCurrency(totalValue)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Weighted</span>
        <span className="summary-value">{formatCurrency(weightedValue)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Won</span>
        <span className="summary-value won">{formatCurrency(wonValue)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Deals</span>
        <span className="summary-value">{deals.length}</span>
      </div>
    </div>
  )
}
```

## Workflows

```typescript
// modules/crm/src/workflows/dealStageChange.ts

export const dealStageChangeWorkflow: WorkflowTemplate = {
  id: 'crm:deal-stage-change',
  name: 'Deal Stage Change',
  description: 'Actions when a deal moves to a new stage',

  trigger: {
    type: 'property_change',
    config: {
      databaseId: 'crm:deals',
      property: 'stage'
    }
  },

  conditions: [],

  actions: [
    // Log activity
    {
      id: 'log-activity',
      type: 'create_record',
      config: {
        databaseId: 'crm:activities',
        data: {
          title: 'Deal moved to {{record.stage}}',
          type: 'note',
          status: 'completed',
          dealId: '{{record.id}}',
          contactId: '{{record.contactId}}',
          owner: '{{currentUser.id}}',
          completedAt: '{{now}}'
        }
      }
    },
    // Update last activity
    {
      id: 'update-last-activity',
      type: 'update_record',
      config: {
        databaseId: 'crm:deals',
        recordId: '{{record.id}}',
        data: {
          lastActivity: '{{now}}'
        }
      }
    },
    // Notify owner
    {
      id: 'notify-owner',
      type: 'notification',
      config: {
        userId: '{{record.owner}}',
        title: 'Deal stage changed',
        message: '{{record.name}} moved to {{record.stage}}'
      }
    }
  ],

  // Additional actions for specific stages
  branches: [
    {
      conditions: [{ field: 'record.stage', operator: 'equals', value: 'won' }],
      actions: [
        {
          id: 'update-contact-status',
          type: 'update_record',
          config: {
            databaseId: 'crm:contacts',
            recordId: '{{record.contactId}}',
            data: { status: 'customer' }
          }
        },
        {
          id: 'update-company-status',
          type: 'update_record',
          config: {
            databaseId: 'crm:companies',
            recordId: '{{record.companyId}}',
            data: { status: 'customer' }
          }
        },
        {
          id: 'celebrate',
          type: 'notification',
          config: {
            channel: 'team',
            title: 'Deal Won!',
            message: '{{record.owner.name}} closed {{record.name}} for {{record.value | currency}}'
          }
        }
      ]
    },
    {
      conditions: [{ field: 'record.stage', operator: 'equals', value: 'lost' }],
      actions: [
        {
          id: 'request-lost-reason',
          type: 'prompt',
          config: {
            userId: '{{record.owner}}',
            title: 'Lost Reason',
            message: 'Why was this deal lost?',
            options: ['price', 'competitor', 'no-budget', 'no-decision', 'timing', 'other'],
            updateField: 'lostReason'
          }
        }
      ]
    }
  ]
}

// modules/crm/src/workflows/activityReminder.ts

export const activityReminderWorkflow: WorkflowTemplate = {
  id: 'crm:activity-reminder',
  name: 'Activity Reminder',
  description: 'Send reminders for upcoming activities',

  trigger: {
    type: 'schedule',
    config: {
      cron: '0 9 * * *' // Daily at 9 AM
    }
  },

  actions: [
    {
      id: 'find-due-activities',
      type: 'query',
      config: {
        databaseId: 'crm:activities',
        filter: {
          and: [
            { property: 'status', operator: 'equals', value: 'planned' },
            { property: 'dueDate', operator: 'is_within', value: { days: 1 } }
          ]
        }
      },
      output: 'activities'
    },
    {
      id: 'send-reminders',
      type: 'foreach',
      config: {
        items: '{{activities}}',
        actions: [
          {
            type: 'notification',
            config: {
              userId: '{{item.owner}}',
              title: 'Activity Due Today',
              message: '{{item.type}}: {{item.title}}',
              link: '/crm/activities/{{item.id}}'
            }
          }
        ]
      }
    }
  ]
}
```

## Dashboard Widgets

```typescript
// modules/crm/src/widgets/DealValueWidget.tsx

import React from 'react'
import { useWidgetData } from '@xnetjs/dashboard'
import { formatCurrency } from '@xnetjs/utils'

export function DealValueWidget({ config }: { config: DealValueWidgetConfig }) {
  const { data, isLoading } = useWidgetData({
    type: 'database',
    databaseId: 'crm:deals',
    query: {
      filter: config.filter,
      aggregations: [
        { field: 'value', function: 'sum', alias: 'total' },
        { field: 'expectedValue', function: 'sum', alias: 'weighted' }
      ]
    }
  })

  if (isLoading) {
    return <WidgetSkeleton />
  }

  return (
    <div className="deal-value-widget">
      <div className="metric-primary">
        <span className="metric-label">Total Pipeline</span>
        <span className="metric-value">
          {formatCurrency(data?.aggregations?.total || 0)}
        </span>
      </div>
      <div className="metric-secondary">
        <span className="metric-label">Weighted Value</span>
        <span className="metric-value">
          {formatCurrency(data?.aggregations?.weighted || 0)}
        </span>
      </div>
    </div>
  )
}

// modules/crm/src/widgets/PipelineFunnelWidget.tsx

export function PipelineFunnelWidget({ config }: { config: PipelineFunnelConfig }) {
  const { data: pipelineData } = useWidgetData({
    type: 'database',
    databaseId: 'crm:pipelines',
    query: {
      filter: { property: 'id', operator: 'equals', value: config.pipelineId }
    }
  })

  const { data: dealsData } = useWidgetData({
    type: 'database',
    databaseId: 'crm:deals',
    query: {
      filter: { property: 'pipelineId', operator: 'equals', value: config.pipelineId },
      groupBy: ['stage'],
      aggregations: [
        { field: 'id', function: 'count', alias: 'count' },
        { field: 'value', function: 'sum', alias: 'value' }
      ]
    }
  })

  const pipeline = pipelineData?.records?.[0]
  const stages = (pipeline?.stages || []).sort((a, b) => a.order - b.order)

  const funnelData = stages.map(stage => {
    const stageData = dealsData?.records?.find(r => r.stage === stage.id)
    return {
      name: stage.name,
      count: stageData?.count || 0,
      value: stageData?.value || 0
    }
  })

  const maxCount = Math.max(...funnelData.map(s => s.count), 1)

  return (
    <div className="pipeline-funnel">
      {funnelData.map((stage, index) => (
        <div
          key={stage.name}
          className="funnel-stage"
          style={{
            width: `${(stage.count / maxCount) * 100}%`
          }}
        >
          <span className="stage-name">{stage.name}</span>
          <span className="stage-count">{stage.count} deals</span>
          <span className="stage-value">{formatCurrency(stage.value)}</span>
        </div>
      ))}
    </div>
  )
}

// modules/crm/src/widgets/ConversionRateWidget.tsx

export function ConversionRateWidget({ config }: { config: ConversionRateConfig }) {
  const { data } = useWidgetData({
    type: 'database',
    databaseId: 'crm:deals',
    query: {
      filter: {
        and: [
          { property: 'pipelineId', operator: 'equals', value: config.pipelineId },
          { property: 'actualCloseDate', operator: 'is_within', value: config.period }
        ]
      }
    }
  })

  const deals = data?.records || []
  const wonDeals = deals.filter(d => d.stage === 'won')
  const lostDeals = deals.filter(d => d.stage === 'lost')

  const totalClosed = wonDeals.length + lostDeals.length
  const conversionRate = totalClosed > 0
    ? (wonDeals.length / totalClosed) * 100
    : 0

  const avgDealSize = wonDeals.length > 0
    ? wonDeals.reduce((sum, d) => sum + d.value, 0) / wonDeals.length
    : 0

  return (
    <div className="conversion-rate-widget">
      <div className="rate-display">
        <CircularProgress value={conversionRate} />
        <span className="rate-value">{conversionRate.toFixed(1)}%</span>
        <span className="rate-label">Win Rate</span>
      </div>

      <div className="rate-details">
        <div className="detail">
          <span className="detail-label">Won</span>
          <span className="detail-value won">{wonDeals.length}</span>
        </div>
        <div className="detail">
          <span className="detail-label">Lost</span>
          <span className="detail-value lost">{lostDeals.length}</span>
        </div>
        <div className="detail">
          <span className="detail-label">Avg Deal</span>
          <span className="detail-value">{formatCurrency(avgDealSize)}</span>
        </div>
      </div>
    </div>
  )
}
```

## File Structure

```
modules/crm/
├── src/
│   ├── index.ts
│   ├── module.ts
│   ├── databases/
│   │   ├── contacts.ts
│   │   ├── companies.ts
│   │   ├── deals.ts
│   │   ├── activities.ts
│   │   └── pipelines.ts
│   ├── components/
│   │   ├── pages/
│   │   │   ├── ContactsPage.tsx
│   │   │   ├── CompaniesPage.tsx
│   │   │   ├── DealsPage.tsx
│   │   │   ├── PipelinePage.tsx
│   │   │   ├── ActivitiesPage.tsx
│   │   │   └── ReportsPage.tsx
│   │   ├── Pipeline.tsx
│   │   ├── DealCard.tsx
│   │   ├── ContactCard.tsx
│   │   ├── CompanyCard.tsx
│   │   ├── ActivityTimeline.tsx
│   │   └── forms/
│   │       ├── ContactForm.tsx
│   │       ├── DealForm.tsx
│   │       └── ActivityForm.tsx
│   ├── widgets/
│   │   ├── DealValueWidget.tsx
│   │   ├── PipelineFunnelWidget.tsx
│   │   ├── ActivityFeedWidget.tsx
│   │   ├── TopDealsWidget.tsx
│   │   └── ConversionRateWidget.tsx
│   ├── workflows/
│   │   ├── dealStageChange.ts
│   │   ├── newLead.ts
│   │   ├── activityReminder.ts
│   │   └── dealWon.ts
│   ├── services/
│   │   ├── EmailService.ts
│   │   └── EnrichmentService.ts
│   └── settings/
│       └── CRMSettings.tsx
├── tests/
│   ├── pipeline.test.tsx
│   ├── workflows.test.ts
│   └── widgets.test.tsx
└── package.json
```

## Validation Checklist

```markdown
## CRM Module Validation

### Contacts

- [ ] Create contact with all fields
- [ ] Edit contact
- [ ] Delete contact
- [ ] Link contact to company
- [ ] View contact activity history
- [ ] Search contacts
- [ ] Filter by status/owner/tags

### Companies

- [ ] Create company
- [ ] View linked contacts
- [ ] View linked deals
- [ ] Rollup calculations work
- [ ] Company enrichment works

### Deals

- [ ] Create deal in pipeline
- [ ] Drag deal between stages
- [ ] Stage change updates probability
- [ ] Deal won/lost workflows fire
- [ ] Rotting indicator shows
- [ ] Close date calendar works

### Pipeline

- [ ] Pipeline board renders
- [ ] Stage totals calculate
- [ ] Weighted values calculate
- [ ] Multiple pipelines supported
- [ ] Pipeline settings work

### Activities

- [ ] Create all activity types
- [ ] Mark activity complete
- [ ] Activity reminders work
- [ ] Activity calendar view works
- [ ] Activities link to deals/contacts

### Workflows

- [ ] Deal stage change workflow fires
- [ ] Activity reminder workflow fires
- [ ] Deal won workflow fires
- [ ] Contact status updates on win

### Dashboards

- [ ] Deal value widget works
- [ ] Pipeline funnel widget works
- [ ] Conversion rate widget works
- [ ] Activity feed widget works
```

---

[← Back to Plugin System](./04-plugin-system.md) | [Next: HRM Module →](./06-hrm-module.md)
