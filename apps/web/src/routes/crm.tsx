/**
 * CRM surface route (exploration 0188). A singleton workbench tab, like
 * /tasks and /experiments.
 */

import { createFileRoute } from '@tanstack/react-router'
import { CrmView } from '../components/crm/CrmView'

export const Route = createFileRoute('/crm')({
  component: CrmView
})
