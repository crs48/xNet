/**
 * useEffectiveSchema — resolve a node type's *effective* schema reactively:
 * the canonical core schema (from the registry) plus any registered extension
 * fields, composed by `buildEffectiveSchema`.
 *
 * This is the keystone for the universal database view: given any schema IRI
 * (a built-in like `Task`/`Contact`, or a database-derived schema), it yields
 * the column set the grid should render — core columns marked `readonly`
 * (structurally locked) and `ext:<authority>/<field>` columns editable.
 *
 * Composition happens at read time (not cached in the registry) because
 * extensions are added/removed live; the two `useQuery` subscriptions keep the
 * effective schema in sync as `SchemaExtension`/`ExtensionField` nodes change.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  buildEffectiveSchema,
  selectExtensionFields,
  schemaRegistry,
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  type Schema,
  type SchemaIRI,
  type ExtensionRecord,
  type ExtensionFieldRecord
} from '@xnetjs/data'
import { useQuery } from './useQuery'

export interface UseEffectiveSchemaResult {
  /** The composed effective schema, or null while the core schema loads / can't resolve. */
  schema: Schema | null
  /** True while the core schema is being resolved. */
  loading: boolean
}

export function useEffectiveSchema(
  schemaId: SchemaIRI | null | undefined
): UseEffectiveSchemaResult {
  const [core, setCore] = useState<Schema | null>(null)
  const [coreLoading, setCoreLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!schemaId) {
      setCore(null)
      setCoreLoading(false)
      return
    }
    setCoreLoading(true)
    schemaRegistry
      .get(schemaId)
      .then((defined) => {
        if (!active) return
        setCore(defined?.schema ?? null)
        setCoreLoading(false)
      })
      .catch(() => {
        if (!active) return
        setCore(null)
        setCoreLoading(false)
      })
    return () => {
      active = false
    }
  }, [schemaId])

  // Live extension declarations + fields (flattened nodes have hoisted props,
  // which match the ExtensionRecord / ExtensionFieldRecord shapes).
  const { data: extensions } = useQuery(SchemaExtensionSchema)
  const { data: fields } = useQuery(ExtensionFieldSchema)

  const schema = useMemo(() => {
    if (!core || !schemaId) return null
    const exts = selectExtensionFields(
      schemaId,
      (extensions ?? []) as unknown as ExtensionRecord[],
      (fields ?? []) as unknown as ExtensionFieldRecord[]
    )
    return buildEffectiveSchema(core, exts)
  }, [core, schemaId, extensions, fields])

  return { schema, loading: coreLoading }
}
