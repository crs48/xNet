import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { ExperimentSchema } from './experiment'
import { MetricSchema } from './metric'
import { ObservationSchema } from './observation'
import { builtInSchemas } from './index'

const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

describe('experiment journal + habit tracker schemas (0180)', () => {
  it('registers all three schemas under versioned and legacy IRIs', () => {
    for (const iri of [
      'xnet://xnet.fyi/Metric@1.0.0',
      'xnet://xnet.fyi/Observation@1.0.0',
      'xnet://xnet.fyi/Experiment@1.0.0',
      'xnet://xnet.fyi/Metric',
      'xnet://xnet.fyi/Observation',
      'xnet://xnet.fyi/Experiment'
    ] as const) {
      expect(builtInSchemas[iri]).toBeTypeOf('function')
    }
  })

  describe('MetricSchema', () => {
    it('has the expected IRI and defaults', () => {
      expect(MetricSchema.schema['@id']).toBe('xnet://xnet.fyi/Metric@1.0.0')
      const metric = MetricSchema.create({ name: 'Meditate' }, { createdBy: testDID })
      expect(metric.kind).toBe('boolean')
      expect(metric.schedule).toBe('none')
      expect(metric.polarity).toBe('higherBetter')
      // Sensitive data is private by default (0180 risk).
      expect(metric.visibility).toBe('private')
    })

    it('models a habit (recurring schedule) and a continuous metric (none)', () => {
      const habit = MetricSchema.create(
        { name: 'Meditate', kind: 'boolean', schedule: 'specificDays', scheduleDays: [1, 3, 5] },
        { createdBy: testDID }
      )
      expect(habit.scheduleDays).toEqual([1, 3, 5])

      const mood = MetricSchema.create(
        { name: 'Mood', kind: 'scale', scaleMin: 1, scaleMax: 5 },
        { createdBy: testDID }
      )
      expect(mood.schedule).toBe('none')
      expect(mood.scaleMax).toBe(5)
    })
  })

  describe('ObservationSchema', () => {
    it('requires a metric and a day, and defaults to private/manual/none', () => {
      const day = Date.UTC(2026, 5, 14)
      const obs = ObservationSchema.create(
        { metric: 'metric-1', day, value: 1 },
        { createdBy: testDID }
      )
      expect(obs.metric).toBe('metric-1')
      expect(obs.day).toBe(day)
      expect(obs.value).toBe(1)
      expect(obs.phase).toBe('none')
      expect(obs.source).toBe('manual')
      expect(obs.visibility).toBe('private')
    })

    it('rejects a missing required metric', () => {
      const result = ObservationSchema.validate({ day: Date.UTC(2026, 5, 14), value: 1 })
      expect(result.valid).toBe(false)
    })

    it('carries a denormalized phase for join-free verdict grouping', () => {
      const obs = ObservationSchema.create(
        { metric: 'm1', day: Date.UTC(2026, 5, 14), value: 7, phase: 'intervention' },
        { createdBy: testDID }
      )
      expect(obs.phase).toBe('intervention')
    })
  })

  describe('ExperimentSchema', () => {
    it('has a collaborative document and rigor fields', () => {
      expect(ExperimentSchema.schema['@id']).toBe('xnet://xnet.fyi/Experiment@1.0.0')
      expect(ExperimentSchema.schema.document).toBe('yjs')
      const exp = ExperimentSchema.create(
        {
          title: 'Magnesium and sleep',
          hypothesisNull: 'Magnesium has no effect on sleep latency.',
          hypothesisAlt: '200mg reduces sleep latency by >10 min.',
          design: 'ABAB'
        },
        { createdBy: testDID }
      )
      expect(exp.status).toBe('design')
      expect(exp.design).toBe('ABAB')
      expect(exp.hypothesisNull).toMatch(/no effect/)
      expect(exp.visibility).toBe('private')
    })

    it('only offers honest conclusions (never "proven")', () => {
      const conclusion = ExperimentSchema.schema.properties.find(
        (p) => p['@id'] === 'xnet://xnet.fyi/Experiment@1.0.0#conclusion'
      )
      const optionIds = ((conclusion?.config?.options ?? []) as Array<{ id: string }>).map(
        (o) => o.id
      )
      expect(optionIds).toEqual(['rejectsNull', 'failsToRejectNull', 'inconclusive'])
    })
  })
})
