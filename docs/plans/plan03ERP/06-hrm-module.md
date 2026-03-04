# 06: HRM Module

> Human Resource Management with employees, recruiting, time tracking, and payroll

**Package:** `modules/@xnetjs/hrm`
**Dependencies:** `@xnetjs/modules`, `@xnetjs/workflows`, `@xnetjs/dashboard`, `@xnetjs/data`
**Estimated Time:** 3 weeks

> **Architecture Update (Jan 2026):**
>
> - HRM entities (Employee, Applicant, TimeOff) defined as Schemas via `defineSchema()`
> - All HRM data stored as Nodes in NodeStore

## Goals

- Complete employee directory and profiles
- Recruiting pipeline with applicant tracking
- Time-off management and tracking
- Organizational structure visualization
- Performance reviews and goals

## Module Definition

```typescript
// modules/hrm/src/module.ts

import { ModuleDefinition } from '@xnetjs/modules'

export const HRMModule: ModuleDefinition = {
  id: 'mod:hrm',
  name: 'HRM',
  version: '1.0.0',
  description: 'Human Resource Management',

  dependencies: {
    core: '3.0.0',
    modules: []
  },

  schema: {
    databases: [
      employeesDatabase,
      departmentsDatabase,
      positionsDatabase,
      applicantsDatabase,
      jobPostingsDatabase,
      timeOffDatabase,
      timeOffPoliciesDatabase,
      performanceReviewsDatabase,
      goalsDatabase
    ],
    relations: [
      { from: 'employees', to: 'departments', type: 'many-to-one', field: 'departmentId' },
      { from: 'employees', to: 'positions', type: 'many-to-one', field: 'positionId' },
      { from: 'employees', to: 'employees', type: 'many-to-one', field: 'managerId' },
      { from: 'applicants', to: 'jobPostings', type: 'many-to-one', field: 'jobPostingId' },
      { from: 'timeOff', to: 'employees', type: 'many-to-one', field: 'employeeId' },
      { from: 'performanceReviews', to: 'employees', type: 'many-to-one', field: 'employeeId' },
      { from: 'goals', to: 'employees', type: 'many-to-one', field: 'employeeId' }
    ]
  },

  components: {
    pages: [
      { id: 'employees', name: 'Employees', component: 'EmployeesPage', icon: 'users' },
      { id: 'org-chart', name: 'Org Chart', component: 'OrgChartPage', icon: 'git-branch' },
      { id: 'recruiting', name: 'Recruiting', component: 'RecruitingPage', icon: 'user-plus' },
      { id: 'time-off', name: 'Time Off', component: 'TimeOffPage', icon: 'calendar' },
      { id: 'performance', name: 'Performance', component: 'PerformancePage', icon: 'trending-up' },
      { id: 'reports', name: 'Reports', component: 'HRReportsPage', icon: 'bar-chart' }
    ],
    widgets: [
      { id: 'headcount', name: 'Headcount', component: 'HeadcountWidget' },
      { id: 'hiring-pipeline', name: 'Hiring Pipeline', component: 'HiringPipelineWidget' },
      { id: 'time-off-calendar', name: 'Time Off Calendar', component: 'TimeOffCalendarWidget' },
      { id: 'anniversaries', name: 'Work Anniversaries', component: 'AnniversariesWidget' },
      {
        id: 'department-breakdown',
        name: 'Department Breakdown',
        component: 'DepartmentBreakdownWidget'
      }
    ],
    actions: [
      { id: 'add-employee', name: 'Add Employee', handler: 'addEmployee' },
      { id: 'post-job', name: 'Post Job', handler: 'postJob' },
      { id: 'request-time-off', name: 'Request Time Off', handler: 'requestTimeOff' },
      { id: 'start-review', name: 'Start Review', handler: 'startReview' }
    ]
  },

  workflows: [
    newHireOnboardingWorkflow,
    timeOffApprovalWorkflow,
    reviewCycleWorkflow,
    anniversaryReminderWorkflow,
    applicantStageChangeWorkflow
  ],

  settings: [
    {
      id: 'fiscalYearStart',
      label: 'Fiscal Year Start',
      type: 'select',
      options: [
        { label: 'January', value: 1 },
        { label: 'April', value: 4 },
        { label: 'July', value: 7 },
        { label: 'October', value: 10 }
      ],
      default: 1
    },
    {
      id: 'reviewCycle',
      label: 'Performance Review Cycle',
      type: 'select',
      options: [
        { label: 'Annual', value: 'annual' },
        { label: 'Semi-Annual', value: 'semi-annual' },
        { label: 'Quarterly', value: 'quarterly' }
      ],
      default: 'annual'
    },
    {
      id: 'approvalChain',
      label: 'Time Off Approval',
      type: 'select',
      options: [
        { label: 'Direct Manager', value: 'manager' },
        { label: 'Manager + HR', value: 'manager-hr' },
        { label: 'HR Only', value: 'hr' }
      ],
      default: 'manager'
    }
  ],

  hooks: {
    onInstall: async (context) => {
      // Create default departments
      const dept = context.databases.get('hrm:departments')
      await dept.createRecord({ name: 'Engineering', code: 'ENG' })
      await dept.createRecord({ name: 'Product', code: 'PROD' })
      await dept.createRecord({ name: 'Sales', code: 'SALES' })
      await dept.createRecord({ name: 'Marketing', code: 'MKT' })
      await dept.createRecord({ name: 'Operations', code: 'OPS' })
      await dept.createRecord({ name: 'Human Resources', code: 'HR' })

      // Create default time-off policies
      const policies = context.databases.get('hrm:timeOffPolicies')
      await policies.createRecord({
        name: 'Annual Leave',
        type: 'vacation',
        daysPerYear: 20,
        carryOver: true,
        maxCarryOver: 5
      })
      await policies.createRecord({
        name: 'Sick Leave',
        type: 'sick',
        daysPerYear: 10,
        carryOver: false
      })
    }
  }
}
```

## Database Schemas

```typescript
// modules/hrm/src/databases/employees.ts

export const employeesDatabase: DatabaseTemplate = {
  id: 'hrm:employees',
  name: 'Employees',
  icon: 'user',
  properties: [
    { id: 'name', name: 'Full Name', type: 'title' },
    { id: 'email', name: 'Work Email', type: 'email' },
    { id: 'personalEmail', name: 'Personal Email', type: 'email' },
    { id: 'phone', name: 'Phone', type: 'phone' },
    { id: 'employeeId', name: 'Employee ID', type: 'text' },
    { id: 'avatar', name: 'Photo', type: 'file', fileTypes: ['image'] },

    // Position
    { id: 'departmentId', name: 'Department', type: 'relation', target: 'hrm:departments' },
    { id: 'positionId', name: 'Position', type: 'relation', target: 'hrm:positions' },
    { id: 'managerId', name: 'Manager', type: 'relation', target: 'hrm:employees' },
    {
      id: 'directReports',
      name: 'Direct Reports',
      type: 'rollup',
      target: 'hrm:employees',
      function: 'count'
    },

    // Employment
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'active', name: 'Active', color: 'green' },
        { id: 'onboarding', name: 'Onboarding', color: 'blue' },
        { id: 'on-leave', name: 'On Leave', color: 'yellow' },
        { id: 'terminated', name: 'Terminated', color: 'red' }
      ]
    },
    {
      id: 'employmentType',
      name: 'Employment Type',
      type: 'select',
      options: [
        { id: 'full-time', name: 'Full-time' },
        { id: 'part-time', name: 'Part-time' },
        { id: 'contractor', name: 'Contractor' },
        { id: 'intern', name: 'Intern' }
      ]
    },
    { id: 'startDate', name: 'Start Date', type: 'date' },
    { id: 'endDate', name: 'End Date', type: 'date' },
    {
      id: 'tenure',
      name: 'Tenure',
      type: 'formula',
      formula: 'dateDiff(startDate, now(), "years")'
    },

    // Location
    {
      id: 'location',
      name: 'Location',
      type: 'select',
      options: [
        { id: 'remote', name: 'Remote' },
        { id: 'office', name: 'Office' },
        { id: 'hybrid', name: 'Hybrid' }
      ]
    },
    { id: 'office', name: 'Office Location', type: 'text' },
    { id: 'timezone', name: 'Timezone', type: 'text' },

    // Personal
    { id: 'birthday', name: 'Birthday', type: 'date' },
    { id: 'address', name: 'Address', type: 'text' },
    { id: 'emergencyContact', name: 'Emergency Contact', type: 'json' },

    // Compensation (restricted access)
    { id: 'salary', name: 'Salary', type: 'number', format: 'currency', restricted: true },
    {
      id: 'salaryFrequency',
      name: 'Pay Frequency',
      type: 'select',
      options: [
        { id: 'annual', name: 'Annual' },
        { id: 'monthly', name: 'Monthly' },
        { id: 'hourly', name: 'Hourly' }
      ],
      restricted: true
    },

    // Time off balances
    { id: 'vacationBalance', name: 'Vacation Balance', type: 'number' },
    { id: 'sickBalance', name: 'Sick Leave Balance', type: 'number' },

    // Notes
    { id: 'notes', name: 'Notes', type: 'rich_text', restricted: true },
    { id: 'skills', name: 'Skills', type: 'multi_select' },
    { id: 'bio', name: 'Bio', type: 'text' }
  ],
  views: [
    {
      id: 'directory',
      name: 'Directory',
      type: 'gallery',
      config: {
        cardProperties: ['positionId', 'departmentId', 'email'],
        coverProperty: 'avatar',
        filter: { property: 'status', operator: 'equals', value: 'active' }
      }
    },
    {
      id: 'all',
      name: 'All Employees',
      type: 'table',
      config: {
        visibleProperties: [
          'name',
          'departmentId',
          'positionId',
          'managerId',
          'status',
          'startDate'
        ]
      }
    },
    {
      id: 'by-department',
      name: 'By Department',
      type: 'board',
      config: {
        groupBy: 'departmentId',
        cardProperties: ['positionId', 'email']
      }
    },
    {
      id: 'birthdays',
      name: 'Birthdays',
      type: 'calendar',
      config: {
        dateProperty: 'birthday',
        recurring: true
      }
    }
  ]
}

// modules/hrm/src/databases/applicants.ts

export const applicantsDatabase: DatabaseTemplate = {
  id: 'hrm:applicants',
  name: 'Applicants',
  icon: 'user-plus',
  properties: [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'email', name: 'Email', type: 'email' },
    { id: 'phone', name: 'Phone', type: 'phone' },
    { id: 'jobPostingId', name: 'Position', type: 'relation', target: 'hrm:jobPostings' },
    {
      id: 'stage',
      name: 'Stage',
      type: 'select',
      options: [
        { id: 'applied', name: 'Applied', color: 'gray' },
        { id: 'screening', name: 'Screening', color: 'blue' },
        { id: 'phone-interview', name: 'Phone Interview', color: 'yellow' },
        { id: 'on-site', name: 'On-site Interview', color: 'orange' },
        { id: 'offer', name: 'Offer', color: 'purple' },
        { id: 'hired', name: 'Hired', color: 'green' },
        { id: 'rejected', name: 'Rejected', color: 'red' },
        { id: 'withdrawn', name: 'Withdrawn', color: 'gray' }
      ]
    },
    {
      id: 'source',
      name: 'Source',
      type: 'select',
      options: [
        { id: 'linkedin', name: 'LinkedIn' },
        { id: 'indeed', name: 'Indeed' },
        { id: 'referral', name: 'Referral' },
        { id: 'website', name: 'Company Website' },
        { id: 'agency', name: 'Recruitment Agency' },
        { id: 'other', name: 'Other' }
      ]
    },
    { id: 'referredBy', name: 'Referred By', type: 'relation', target: 'hrm:employees' },
    { id: 'resume', name: 'Resume', type: 'file' },
    { id: 'coverLetter', name: 'Cover Letter', type: 'file' },
    { id: 'linkedinUrl', name: 'LinkedIn', type: 'url' },
    { id: 'portfolioUrl', name: 'Portfolio', type: 'url' },
    { id: 'salaryExpectation', name: 'Salary Expectation', type: 'number', format: 'currency' },
    { id: 'availableFrom', name: 'Available From', type: 'date' },
    { id: 'recruiter', name: 'Recruiter', type: 'person' },
    { id: 'hiringManager', name: 'Hiring Manager', type: 'person' },
    { id: 'appliedAt', name: 'Applied Date', type: 'date' },
    { id: 'lastActivity', name: 'Last Activity', type: 'date' },
    { id: 'rating', name: 'Rating', type: 'number', format: 'rating', max: 5 },
    { id: 'interviews', name: 'Interviews', type: 'json' },
    { id: 'feedback', name: 'Feedback', type: 'rich_text' },
    { id: 'notes', name: 'Notes', type: 'rich_text' },
    {
      id: 'rejectionReason',
      name: 'Rejection Reason',
      type: 'select',
      options: [
        { id: 'not-qualified', name: 'Not Qualified' },
        { id: 'culture-fit', name: 'Culture Fit' },
        { id: 'salary', name: 'Salary Mismatch' },
        { id: 'other-candidate', name: 'Another Candidate Selected' },
        { id: 'position-filled', name: 'Position Filled' },
        { id: 'position-closed', name: 'Position Closed' }
      ]
    }
  ],
  views: [
    {
      id: 'pipeline',
      name: 'Pipeline',
      type: 'board',
      config: {
        groupBy: 'stage',
        cardProperties: ['jobPostingId', 'rating', 'appliedAt']
      }
    },
    {
      id: 'all',
      name: 'All Applicants',
      type: 'table',
      config: {
        visibleProperties: ['name', 'jobPostingId', 'stage', 'source', 'recruiter', 'appliedAt']
      }
    },
    {
      id: 'by-position',
      name: 'By Position',
      type: 'table',
      config: {
        groupBy: 'jobPostingId'
      }
    }
  ]
}

// modules/hrm/src/databases/timeOff.ts

export const timeOffDatabase: DatabaseTemplate = {
  id: 'hrm:timeOff',
  name: 'Time Off Requests',
  icon: 'calendar',
  properties: [
    { id: 'title', name: 'Title', type: 'formula', formula: 'concat(employee.name, " - ", type)' },
    { id: 'employeeId', name: 'Employee', type: 'relation', target: 'hrm:employees' },
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      options: [
        { id: 'vacation', name: 'Vacation', color: 'green' },
        { id: 'sick', name: 'Sick Leave', color: 'red' },
        { id: 'personal', name: 'Personal', color: 'blue' },
        { id: 'bereavement', name: 'Bereavement', color: 'gray' },
        { id: 'parental', name: 'Parental Leave', color: 'purple' },
        { id: 'unpaid', name: 'Unpaid Leave', color: 'yellow' }
      ]
    },
    { id: 'startDate', name: 'Start Date', type: 'date' },
    { id: 'endDate', name: 'End Date', type: 'date' },
    { id: 'days', name: 'Days', type: 'formula', formula: 'workDays(startDate, endDate)' },
    { id: 'halfDay', name: 'Half Day', type: 'checkbox' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'pending', name: 'Pending', color: 'yellow' },
        { id: 'approved', name: 'Approved', color: 'green' },
        { id: 'rejected', name: 'Rejected', color: 'red' },
        { id: 'cancelled', name: 'Cancelled', color: 'gray' }
      ]
    },
    { id: 'approver', name: 'Approver', type: 'person' },
    { id: 'approvedAt', name: 'Approved At', type: 'date' },
    { id: 'reason', name: 'Reason', type: 'text' },
    { id: 'notes', name: 'Notes', type: 'text' },
    { id: 'requestedAt', name: 'Requested At', type: 'date' }
  ],
  views: [
    {
      id: 'calendar',
      name: 'Calendar',
      type: 'calendar',
      config: {
        dateProperty: 'startDate',
        endDateProperty: 'endDate',
        filter: { property: 'status', operator: 'equals', value: 'approved' }
      }
    },
    {
      id: 'pending',
      name: 'Pending Approval',
      type: 'table',
      config: {
        filter: { property: 'status', operator: 'equals', value: 'pending' },
        sorts: [{ property: 'requestedAt', direction: 'asc' }]
      }
    },
    {
      id: 'my-requests',
      name: 'My Requests',
      type: 'table',
      config: {
        filter: { property: 'employeeId', operator: 'equals', value: '{{currentUser.employeeId}}' }
      }
    }
  ]
}

// modules/hrm/src/databases/performanceReviews.ts

export const performanceReviewsDatabase: DatabaseTemplate = {
  id: 'hrm:performanceReviews',
  name: 'Performance Reviews',
  icon: 'trending-up',
  properties: [
    {
      id: 'title',
      name: 'Title',
      type: 'formula',
      formula: 'concat(employee.name, " - ", period)'
    },
    { id: 'employeeId', name: 'Employee', type: 'relation', target: 'hrm:employees' },
    { id: 'reviewerId', name: 'Reviewer', type: 'relation', target: 'hrm:employees' },
    { id: 'period', name: 'Review Period', type: 'text' },
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      options: [
        { id: 'annual', name: 'Annual Review' },
        { id: 'probation', name: 'Probation Review' },
        { id: 'mid-year', name: 'Mid-Year Review' },
        { id: 'project', name: 'Project Review' }
      ]
    },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'draft', name: 'Draft', color: 'gray' },
        { id: 'self-review', name: 'Self Review', color: 'blue' },
        { id: 'manager-review', name: 'Manager Review', color: 'yellow' },
        { id: 'calibration', name: 'Calibration', color: 'orange' },
        { id: 'completed', name: 'Completed', color: 'green' }
      ]
    },
    {
      id: 'overallRating',
      name: 'Overall Rating',
      type: 'select',
      options: [
        { id: 'exceptional', name: 'Exceptional', color: 'green' },
        { id: 'exceeds', name: 'Exceeds Expectations', color: 'blue' },
        { id: 'meets', name: 'Meets Expectations', color: 'yellow' },
        { id: 'needs-improvement', name: 'Needs Improvement', color: 'orange' },
        { id: 'unsatisfactory', name: 'Unsatisfactory', color: 'red' }
      ]
    },
    { id: 'selfAssessment', name: 'Self Assessment', type: 'rich_text' },
    { id: 'managerAssessment', name: 'Manager Assessment', type: 'rich_text' },
    { id: 'achievements', name: 'Key Achievements', type: 'rich_text' },
    { id: 'improvements', name: 'Areas for Improvement', type: 'rich_text' },
    { id: 'goals', name: 'Goals for Next Period', type: 'rich_text' },
    { id: 'competencies', name: 'Competency Ratings', type: 'json' },
    { id: 'dueDate', name: 'Due Date', type: 'date' },
    { id: 'completedAt', name: 'Completed At', type: 'date' }
  ]
}
```

## Org Chart Component

```typescript
// modules/hrm/src/components/OrgChart.tsx

import React, { useMemo } from 'react'
import { useDatabase, useRecords } from '@xnetjs/database'
import { Tree, TreeNode } from '@xnetjs/ui'

export function OrgChart() {
  const { database } = useDatabase('hrm:employees')
  const { records: employees } = useRecords(database, {
    filter: { property: 'status', operator: 'equals', value: 'active' }
  })

  // Build tree structure
  const orgTree = useMemo(() => {
    const employeeMap = new Map(employees.map(e => [e.id, e]))
    const roots: Employee[] = []
    const childrenMap = new Map<string, Employee[]>()

    for (const employee of employees) {
      if (!employee.managerId) {
        roots.push(employee)
      } else {
        const siblings = childrenMap.get(employee.managerId) || []
        siblings.push(employee)
        childrenMap.set(employee.managerId, siblings)
      }
    }

    function buildNode(employee: Employee): OrgNode {
      const children = childrenMap.get(employee.id) || []
      return {
        employee,
        children: children.map(buildNode)
      }
    }

    return roots.map(buildNode)
  }, [employees])

  return (
    <div className="org-chart">
      <div className="org-chart-header">
        <h2>Organization Chart</h2>
        <OrgChartControls />
      </div>

      <div className="org-chart-container">
        {orgTree.map(node => (
          <OrgChartNode key={node.employee.id} node={node} level={0} />
        ))}
      </div>
    </div>
  )
}

function OrgChartNode({ node, level }: { node: OrgNode; level: number }) {
  const [expanded, setExpanded] = React.useState(level < 2)
  const hasChildren = node.children.length > 0

  return (
    <div className="org-node">
      <div className="org-card" onClick={() => hasChildren && setExpanded(!expanded)}>
        <img
          src={node.employee.avatar || '/default-avatar.png'}
          alt={node.employee.name}
          className="org-avatar"
        />
        <div className="org-info">
          <span className="org-name">{node.employee.name}</span>
          <span className="org-title">{node.employee.positionId?.name}</span>
          <span className="org-department">{node.employee.departmentId?.name}</span>
        </div>
        {hasChildren && (
          <span className="org-expand">
            {expanded ? '−' : '+'} {node.children.length}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="org-children">
          {node.children.map(child => (
            <OrgChartNode key={child.employee.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface OrgNode {
  employee: Employee
  children: OrgNode[]
}
```

## Time Off Management

```typescript
// modules/hrm/src/components/TimeOffRequest.tsx

import React, { useState } from 'react'
import { useDatabase } from '@xnetjs/database'
import { useCurrentUser } from '@xnetjs/identity'
import { DateRangePicker, Select, Textarea, Button } from '@xnetjs/ui'

export function TimeOffRequestForm({ onSubmit }: { onSubmit: () => void }) {
  const { createRecord } = useDatabase('hrm:timeOff')
  const currentUser = useCurrentUser()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    type: 'vacation',
    startDate: null as Date | null,
    endDate: null as Date | null,
    halfDay: false,
    reason: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await createRecord({
        employeeId: currentUser.employeeId,
        type: formData.type,
        startDate: formData.startDate?.getTime(),
        endDate: formData.endDate?.getTime(),
        halfDay: formData.halfDay,
        reason: formData.reason,
        status: 'pending',
        requestedAt: Date.now()
      })
      onSubmit()
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="time-off-form">
      <Select
        label="Type"
        value={formData.type}
        onChange={(type) => setFormData({ ...formData, type })}
        options={[
          { value: 'vacation', label: 'Vacation' },
          { value: 'sick', label: 'Sick Leave' },
          { value: 'personal', label: 'Personal' },
          { value: 'bereavement', label: 'Bereavement' },
          { value: 'parental', label: 'Parental Leave' },
          { value: 'unpaid', label: 'Unpaid Leave' }
        ]}
      />

      <DateRangePicker
        label="Dates"
        startDate={formData.startDate}
        endDate={formData.endDate}
        onChange={([start, end]) => setFormData({
          ...formData,
          startDate: start,
          endDate: end
        })}
      />

      <Checkbox
        label="Half Day"
        checked={formData.halfDay}
        onChange={(halfDay) => setFormData({ ...formData, halfDay })}
      />

      <Textarea
        label="Reason (optional)"
        value={formData.reason}
        onChange={(reason) => setFormData({ ...formData, reason })}
        rows={3}
      />

      <BalanceDisplay employeeId={currentUser.employeeId} type={formData.type} />

      <Button type="submit" loading={loading}>
        Submit Request
      </Button>
    </form>
  )
}

function BalanceDisplay({
  employeeId,
  type
}: {
  employeeId: string
  type: string
}) {
  const { database } = useDatabase('hrm:employees')
  const { records } = useRecords(database, {
    filter: { property: 'id', operator: 'equals', value: employeeId }
  })

  const employee = records[0]
  if (!employee) return null

  const balance = type === 'vacation'
    ? employee.vacationBalance
    : type === 'sick'
    ? employee.sickBalance
    : null

  if (balance === null) return null

  return (
    <div className="balance-display">
      <span className="balance-label">Available Balance:</span>
      <span className="balance-value">{balance} days</span>
    </div>
  )
}
```

## Workflows

```typescript
// modules/hrm/src/workflows/newHireOnboarding.ts

export const newHireOnboardingWorkflow: WorkflowTemplate = {
  id: 'hrm:new-hire-onboarding',
  name: 'New Hire Onboarding',
  description: 'Automated onboarding tasks for new employees',

  trigger: {
    type: 'record_create',
    config: {
      databaseId: 'hrm:employees'
    }
  },

  conditions: [{ field: 'record.status', operator: 'equals', value: 'onboarding' }],

  actions: [
    // Notify HR
    {
      id: 'notify-hr',
      type: 'notification',
      config: {
        role: 'hr',
        title: 'New Employee Starting',
        message: '{{record.name}} is starting on {{record.startDate | date}}',
        link: '/hrm/employees/{{record.id}}'
      }
    },
    // Notify manager
    {
      id: 'notify-manager',
      type: 'notification',
      config: {
        userId: '{{record.managerId.userId}}',
        title: 'New Team Member',
        message: '{{record.name}} will be joining your team on {{record.startDate | date}}'
      }
    },
    // Create onboarding tasks
    {
      id: 'create-tasks',
      type: 'create_records',
      config: {
        databaseId: 'tasks',
        records: [
          {
            title: 'Set up workstation for {{record.name}}',
            assignee: '{{record.managerId}}',
            dueDate: '{{record.startDate | subtract: 2, "days"}}',
            tags: ['onboarding']
          },
          {
            title: 'Prepare welcome package for {{record.name}}',
            assignee: 'hr',
            dueDate: '{{record.startDate | subtract: 1, "day"}}',
            tags: ['onboarding']
          },
          {
            title: 'Schedule orientation for {{record.name}}',
            assignee: 'hr',
            dueDate: '{{record.startDate}}',
            tags: ['onboarding']
          },
          {
            title: 'First week check-in with {{record.name}}',
            assignee: '{{record.managerId}}',
            dueDate: '{{record.startDate | add: 5, "days"}}',
            tags: ['onboarding']
          },
          {
            title: '30-day review for {{record.name}}',
            assignee: '{{record.managerId}}',
            dueDate: '{{record.startDate | add: 30, "days"}}',
            tags: ['onboarding']
          }
        ]
      }
    },
    // Send welcome email
    {
      id: 'welcome-email',
      type: 'email',
      config: {
        to: '{{record.personalEmail}}',
        template: 'welcome-new-employee',
        data: {
          name: '{{record.name}}',
          startDate: '{{record.startDate | date}}',
          manager: '{{record.managerId.name}}',
          department: '{{record.departmentId.name}}'
        }
      }
    }
  ]
}

// modules/hrm/src/workflows/timeOffApproval.ts

export const timeOffApprovalWorkflow: WorkflowTemplate = {
  id: 'hrm:time-off-approval',
  name: 'Time Off Approval',
  description: 'Route time off requests for approval',

  trigger: {
    type: 'record_create',
    config: {
      databaseId: 'hrm:timeOff'
    }
  },

  conditions: [{ field: 'record.status', operator: 'equals', value: 'pending' }],

  actions: [
    // Get employee's manager
    {
      id: 'get-manager',
      type: 'query',
      config: {
        databaseId: 'hrm:employees',
        filter: { property: 'id', operator: 'equals', value: '{{record.employeeId}}' }
      },
      output: 'employee'
    },
    // Notify manager for approval
    {
      id: 'notify-manager',
      type: 'notification',
      config: {
        userId: '{{employee.managerId.userId}}',
        title: 'Time Off Request',
        message: '{{employee.name}} has requested {{record.days}} days of {{record.type}}',
        actions: [
          { label: 'Approve', action: 'approve_time_off', data: { id: '{{record.id}}' } },
          { label: 'Reject', action: 'reject_time_off', data: { id: '{{record.id}}' } }
        ]
      }
    }
  ]
}

// modules/hrm/src/workflows/reviewCycle.ts

export const reviewCycleWorkflow: WorkflowTemplate = {
  id: 'hrm:review-cycle',
  name: 'Performance Review Cycle',
  description: 'Initiate performance review cycle',

  trigger: {
    type: 'schedule',
    config: {
      // Run on January 1st and July 1st
      cron: '0 9 1 1,7 *'
    }
  },

  actions: [
    // Get all active employees
    {
      id: 'get-employees',
      type: 'query',
      config: {
        databaseId: 'hrm:employees',
        filter: {
          and: [
            { property: 'status', operator: 'equals', value: 'active' },
            { property: 'employmentType', operator: 'not_equals', value: 'intern' }
          ]
        }
      },
      output: 'employees'
    },
    // Create review records
    {
      id: 'create-reviews',
      type: 'foreach',
      config: {
        items: '{{employees}}',
        actions: [
          {
            type: 'create_record',
            config: {
              databaseId: 'hrm:performanceReviews',
              data: {
                employeeId: '{{item.id}}',
                reviewerId: '{{item.managerId}}',
                period: '{{now | date: "YYYY"}} {{now | date: "Q"}}',
                type: 'annual',
                status: 'self-review',
                dueDate: '{{now | add: 14, "days"}}'
              }
            }
          }
        ]
      }
    },
    // Notify all employees
    {
      id: 'notify-employees',
      type: 'notification',
      config: {
        role: 'all',
        title: 'Performance Review Cycle Started',
        message: 'Please complete your self-assessment by {{now | add: 14, "days" | date}}'
      }
    }
  ]
}
```

## File Structure

```
modules/hrm/
├── src/
│   ├── index.ts
│   ├── module.ts
│   ├── databases/
│   │   ├── employees.ts
│   │   ├── departments.ts
│   │   ├── positions.ts
│   │   ├── applicants.ts
│   │   ├── jobPostings.ts
│   │   ├── timeOff.ts
│   │   ├── timeOffPolicies.ts
│   │   ├── performanceReviews.ts
│   │   └── goals.ts
│   ├── components/
│   │   ├── pages/
│   │   │   ├── EmployeesPage.tsx
│   │   │   ├── OrgChartPage.tsx
│   │   │   ├── RecruitingPage.tsx
│   │   │   ├── TimeOffPage.tsx
│   │   │   ├── PerformancePage.tsx
│   │   │   └── HRReportsPage.tsx
│   │   ├── OrgChart.tsx
│   │   ├── EmployeeCard.tsx
│   │   ├── EmployeeProfile.tsx
│   │   ├── ApplicantCard.tsx
│   │   ├── HiringPipeline.tsx
│   │   ├── TimeOffRequest.tsx
│   │   ├── TimeOffCalendar.tsx
│   │   ├── ReviewForm.tsx
│   │   └── GoalTracker.tsx
│   ├── widgets/
│   │   ├── HeadcountWidget.tsx
│   │   ├── HiringPipelineWidget.tsx
│   │   ├── TimeOffCalendarWidget.tsx
│   │   ├── AnniversariesWidget.tsx
│   │   └── DepartmentBreakdownWidget.tsx
│   ├── workflows/
│   │   ├── newHireOnboarding.ts
│   │   ├── timeOffApproval.ts
│   │   ├── reviewCycle.ts
│   │   ├── anniversaryReminder.ts
│   │   └── applicantStageChange.ts
│   └── settings/
│       └── HRMSettings.tsx
├── tests/
│   ├── employees.test.ts
│   ├── timeOff.test.ts
│   ├── recruiting.test.ts
│   └── workflows.test.ts
└── package.json
```

## Validation Checklist

```markdown
## HRM Module Validation

### Employees

- [ ] Create employee with all fields
- [ ] Edit employee profile
- [ ] Deactivate employee
- [ ] View employee directory
- [ ] Search employees
- [ ] Filter by department/status

### Org Chart

- [ ] Org chart renders correctly
- [ ] Expand/collapse nodes works
- [ ] Manager relationships correct
- [ ] Navigate to employee profile

### Recruiting

- [ ] Create job posting
- [ ] Add applicant to job
- [ ] Move applicant through stages
- [ ] Rejection workflow works
- [ ] Hire workflow creates employee

### Time Off

- [ ] Submit time off request
- [ ] Manager approval notification
- [ ] Approve/reject works
- [ ] Balance updates correctly
- [ ] Calendar shows approved time off

### Performance

- [ ] Review cycle creates reviews
- [ ] Self-assessment submission
- [ ] Manager assessment submission
- [ ] Rating and calibration
- [ ] Goal tracking

### Workflows

- [ ] New hire onboarding tasks created
- [ ] Time off approval routing
- [ ] Review cycle initiation
- [ ] Anniversary reminders

### Reports

- [ ] Headcount report
- [ ] Turnover report
- [ ] Time off utilization
- [ ] Hiring metrics
```

---

[← Back to CRM Module](./05-crm-module.md) | [Next: Inventory Module →](./07-inventory-module.md)
