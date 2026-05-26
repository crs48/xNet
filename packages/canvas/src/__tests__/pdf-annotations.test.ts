import { describe, expect, it } from 'vitest'
import {
  createCanvasPdfAnnotation,
  createCanvasPdfAnnotationOverlay,
  getCanvasPdfAnnotationsForPage,
  isCanvasPdfAnnotationSourceDetached,
  updateCanvasPdfAnnotation
} from '../pdf/annotations'

describe('PDF annotation overlays', () => {
  it('creates normalized annotations with page anchor ids', () => {
    const annotation = createCanvasPdfAnnotation({
      id: 'ann-1',
      objectId: 'pdf-1',
      pageNumber: 2,
      kind: 'highlight',
      rect: {
        xRatio: 0.2,
        yRatio: 0.1,
        widthRatio: 0.6,
        heightRatio: 0.3
      },
      style: { fill: '#f6d365', opacity: 0.4 },
      createdAt: '2026-05-25T00:00:00.000Z'
    })

    expect(annotation.anchorId).toBe('pdf-1#page:2#ratio:0.5,0.25')
    expect(annotation.rect).toEqual({
      xRatio: 0.2,
      yRatio: 0.1,
      widthRatio: 0.6,
      heightRatio: 0.3
    })
    expect(annotation.updatedAt).toBe('2026-05-25T00:00:00.000Z')
  })

  it('keeps overlay records detached from source PDF bytes', () => {
    const annotation = createCanvasPdfAnnotation({
      id: 'ann-1',
      objectId: 'pdf-1',
      pageNumber: 1,
      kind: 'note',
      text: 'Check this clause',
      points: [{ xRatio: 0.25, yRatio: 0.5 }],
      createdAt: '2026-05-25T00:00:00.000Z'
    })
    const overlay = createCanvasPdfAnnotationOverlay({
      objectId: 'pdf-1',
      sourceFingerprint: 'sha256:pdf-source',
      annotations: [annotation]
    })

    expect(isCanvasPdfAnnotationSourceDetached(annotation)).toBe(true)
    expect(isCanvasPdfAnnotationSourceDetached(overlay)).toBe(true)
    expect(isCanvasPdfAnnotationSourceDetached({ ...annotation, pdfBytes: 'raw' })).toBe(false)
    expect(overlay).toEqual({
      objectId: 'pdf-1',
      sourceFingerprint: 'sha256:pdf-source',
      annotations: [annotation]
    })
  })

  it('filters annotations by object and page in stable render order', () => {
    const annotations = [
      createCanvasPdfAnnotation({
        id: 'ann-b',
        objectId: 'pdf-1',
        pageNumber: 2,
        kind: 'rectangle',
        zIndex: 2,
        createdAt: '2026-05-25T00:00:00.000Z'
      }),
      createCanvasPdfAnnotation({
        id: 'ann-a',
        objectId: 'pdf-1',
        pageNumber: 2,
        kind: 'arrow',
        zIndex: 1,
        createdAt: '2026-05-25T00:00:00.000Z'
      }),
      createCanvasPdfAnnotation({
        id: 'ann-other',
        objectId: 'pdf-2',
        pageNumber: 2,
        kind: 'highlight',
        createdAt: '2026-05-25T00:00:00.000Z'
      })
    ]
    const overlay = createCanvasPdfAnnotationOverlay({ objectId: 'pdf-1', annotations })

    expect(overlay.annotations.map((annotation) => annotation.id)).toEqual(['ann-a', 'ann-b'])
    expect(getCanvasPdfAnnotationsForPage(overlay, 2).map((annotation) => annotation.id)).toEqual([
      'ann-a',
      'ann-b'
    ])
  })

  it('updates annotations without changing creation metadata', () => {
    const annotation = createCanvasPdfAnnotation({
      id: 'ann-1',
      objectId: 'pdf-1',
      pageNumber: 4,
      kind: 'callout',
      text: 'Old note',
      createdAt: '2026-05-25T00:00:00.000Z'
    })
    const updated = updateCanvasPdfAnnotation(annotation, {
      text: 'New note',
      updatedAt: '2026-05-25T01:00:00.000Z'
    })

    expect(updated.createdAt).toBe('2026-05-25T00:00:00.000Z')
    expect(updated.updatedAt).toBe('2026-05-25T01:00:00.000Z')
    expect(updated.text).toBe('New note')
  })
})
