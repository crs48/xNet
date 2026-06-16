/**
 * Finance surface route (exploration 0187). A singleton workbench tab, like
 * /tasks and /experiments.
 */

import { createFileRoute } from '@tanstack/react-router'
import { FinanceView } from '../components/finance/FinanceView'

export const Route = createFileRoute('/finance')({
  component: FinanceView
})
