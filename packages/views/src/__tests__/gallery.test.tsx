/**
 * Tests for gallery view components
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGalleryState, CARD_SIZES } from '../gallery/useGalleryState'
import type { Schema } from '@xnet/data'
import type { ViewConfig } from '../types'

// Mock schema
const mockSchema: Schema = {
  '@id': 'xnet://xnet.dev/Product',
  '@type': 'xnet://xnet.dev/Schema',
  name: 'Product',
  namespace: 'xnet.dev',
  properties: [
    {
      '@id': 'xnet://xnet.dev/Product#name',
      name: 'Name',
      type: 'text',
      required: true
    },
    {
      '@id': 'xnet://xnet.dev/Product#price',
      name: 'Price',
      type: 'number',
      required: false
    },
    {
      '@id': 'xnet://xnet.dev/Product#image',
      name: 'Image',
      type: 'file',
      required: false
    },
    {
      '@id': 'xnet://xnet.dev/Product#category',
      name: 'Category',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'electronics', name: 'Electronics' },
          { id: 'clothing', name: 'Clothing' }
        ]
      }
    }
  ]
}

const mockView: ViewConfig = {
  id: 'view-1',
  name: 'Gallery',
  type: 'gallery',
  visibleProperties: ['name', 'price', 'category'],
  sorts: [],
  coverProperty: 'image',
  galleryCardSize: 'medium',
  galleryImageFit: 'cover',
  galleryShowTitle: true
}

const mockData = [
  {
    id: '1',
    name: 'Product 1',
    price: 99,
    image: { url: 'https://example.com/1.jpg' },
    category: 'electronics'
  },
  { id: '2', name: 'Product 2', price: 149, image: null, category: 'clothing' },
  { id: '3', name: 'Product 3', price: 199, image: 'https://example.com/3.jpg', category: null }
]

describe('useGalleryState', () => {
  it('should return card dimensions based on card size', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.cardDimensions).toEqual(CARD_SIZES.medium)
  })

  it('should identify cover property', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.coverProperty).toBeDefined()
    expect(result.current.coverProperty?.name).toBe('Image')
  })

  it('should identify title property (first text)', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.titleProperty).toBeDefined()
    expect(result.current.titleProperty?.name).toBe('Name')
  })

  it('should return display properties excluding title and cover', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    // Should have price and category (not name or image)
    expect(result.current.displayProperties).toHaveLength(2)
    expect(result.current.displayProperties.map((p) => p.name)).toContain('Price')
    expect(result.current.displayProperties.map((p) => p.name)).toContain('Category')
  })

  it('should respect image fit setting', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.imageFit).toBe('cover')
  })

  it('should respect show title setting', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.showTitle).toBe(true)
  })

  it('should handle missing cover property', () => {
    const viewWithoutCover: ViewConfig = {
      ...mockView,
      coverProperty: undefined
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: viewWithoutCover,
        data: mockData
      })
    )

    expect(result.current.coverProperty).toBeUndefined()
  })

  it('should default to medium card size', () => {
    const viewWithoutSize: ViewConfig = {
      ...mockView,
      galleryCardSize: undefined
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: viewWithoutSize,
        data: mockData
      })
    )

    expect(result.current.cardDimensions).toEqual(CARD_SIZES.medium)
  })

  it('should support small card size', () => {
    const smallView: ViewConfig = {
      ...mockView,
      galleryCardSize: 'small'
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: smallView,
        data: mockData
      })
    )

    expect(result.current.cardDimensions).toEqual(CARD_SIZES.small)
  })

  it('should support large card size', () => {
    const largeView: ViewConfig = {
      ...mockView,
      galleryCardSize: 'large'
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: largeView,
        data: mockData
      })
    )

    expect(result.current.cardDimensions).toEqual(CARD_SIZES.large)
  })

  it('should support contain image fit', () => {
    const containView: ViewConfig = {
      ...mockView,
      galleryImageFit: 'contain'
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: containView,
        data: mockData
      })
    )

    expect(result.current.imageFit).toBe('contain')
  })

  it('should default showTitle to true', () => {
    const viewWithoutShowTitle: ViewConfig = {
      ...mockView,
      galleryShowTitle: undefined
    }

    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: viewWithoutShowTitle,
        data: mockData
      })
    )

    expect(result.current.showTitle).toBe(true)
  })

  it('should return all items', () => {
    const { result } = renderHook(() =>
      useGalleryState({
        schema: mockSchema,
        view: mockView,
        data: mockData
      })
    )

    expect(result.current.items).toHaveLength(3)
  })
})

describe('CARD_SIZES', () => {
  it('should have correct dimensions for small', () => {
    expect(CARD_SIZES.small).toEqual({ width: 180, height: 200 })
  })

  it('should have correct dimensions for medium', () => {
    expect(CARD_SIZES.medium).toEqual({ width: 240, height: 280 })
  })

  it('should have correct dimensions for large', () => {
    expect(CARD_SIZES.large).toEqual({ width: 320, height: 360 })
  })
})
