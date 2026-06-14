/**
 * Experiments surface route (exploration 0180). A singleton workbench tab,
 * like /tasks and /data.
 */

import { createFileRoute } from '@tanstack/react-router'
import { ExperimentsView } from '../components/experiments/ExperimentsView'

export const Route = createFileRoute('/experiments')({
  component: ExperimentsView
})
