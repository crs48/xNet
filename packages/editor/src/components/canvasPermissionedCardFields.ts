/**
 * Permission-aware field rendering helpers for canvas cards.
 */

export type CanvasRestrictedCardFieldReason =
  | 'permission-denied'
  | 'missing-permission'
  | 'workspace-policy'
  | 'field-hidden'
  | 'unknown'

export type CanvasRestrictedCardField = {
  fieldId?: string | null
  label?: string | null
  reason?: CanvasRestrictedCardFieldReason
  requiredPermission?: string | null
  replacement?: string | null
}

export type CanvasCardField = {
  fieldId?: string | null
  label: string
  value: string
}

export type CanvasPermissionedCardField = CanvasCardField & {
  fieldId: string
  restricted: boolean
  displayValue: string
  restrictionReason?: CanvasRestrictedCardFieldReason
  requiredPermission?: string
}

const DEFAULT_RESTRICTED_VALUE = 'Restricted'

export function createCanvasCardFieldId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'field'
}

function normalizeMatchValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function getRestrictionForField(
  field: CanvasCardField,
  restrictedFields: readonly CanvasRestrictedCardField[] | null | undefined
): CanvasRestrictedCardField | null {
  if (!restrictedFields || restrictedFields.length === 0) {
    return null
  }

  const fieldId = normalizeMatchValue(field.fieldId ?? createCanvasCardFieldId(field.label))
  const label = normalizeMatchValue(field.label)

  return (
    restrictedFields.find((restrictedField) => {
      const restrictedFieldId = normalizeMatchValue(restrictedField.fieldId)
      const restrictedLabel = normalizeMatchValue(restrictedField.label)

      return (
        (fieldId !== null && restrictedFieldId !== null && fieldId === restrictedFieldId) ||
        (label !== null && restrictedLabel !== null && label === restrictedLabel)
      )
    }) ?? null
  )
}

export function createCanvasPermissionedCardField(
  field: CanvasCardField,
  restrictedFields: readonly CanvasRestrictedCardField[] | null | undefined
): CanvasPermissionedCardField {
  const fieldId = field.fieldId?.trim() || createCanvasCardFieldId(field.label)
  const restriction = getRestrictionForField({ ...field, fieldId }, restrictedFields)
  const replacement = restriction?.replacement?.trim() || DEFAULT_RESTRICTED_VALUE
  const requiredPermission = restriction?.requiredPermission?.trim()

  return {
    ...field,
    fieldId,
    restricted: restriction !== null,
    displayValue: restriction ? replacement : field.value,
    ...(restriction?.reason ? { restrictionReason: restriction.reason } : {}),
    ...(requiredPermission ? { requiredPermission } : {})
  }
}

export function createCanvasPermissionedCardFields(
  fields: readonly CanvasCardField[],
  restrictedFields: readonly CanvasRestrictedCardField[] | null | undefined
): readonly CanvasPermissionedCardField[] {
  return fields.map((field) => createCanvasPermissionedCardField(field, restrictedFields))
}
