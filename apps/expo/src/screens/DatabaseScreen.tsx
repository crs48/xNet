/**
 * Database screen — the mobile database surface (exploration 0159).
 *
 * Mobile doesn't get the grid: rows render as cards (title + a summary of
 * visible fields), tapping a card opens a full-screen row editor with
 * stacked native field editors. Backed by the same useGridDatabase hook as
 * the desktop grid, so edits sync and undo identically.
 */
import type { RootStackParamList } from '../navigation/types'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { CellValue } from '@xnetjs/data'
import type { GridFieldModel, GridRowModel } from '@xnetjs/react'
import { useGridDatabase } from '@xnetjs/react'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Database'>
  route: RouteProp<RootStackParamList, 'Database'>
}

// ─── Cell display helpers ────────────────────────────────────────────────────

function cellText(field: GridFieldModel, value: CellValue | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  switch (field.type) {
    case 'checkbox':
      return value === true ? '✓' : ''
    case 'select': {
      const option = field.options?.find((o) => o.id === value)
      return option?.name ?? String(value)
    }
    case 'multiSelect': {
      const ids = Array.isArray(value) ? value : [String(value)]
      return ids.map((id) => field.options?.find((o) => o.id === id)?.name ?? id).join(', ')
    }
    case 'date':
    case 'created':
    case 'updated':
      return typeof value === 'string' ? new Date(value).toLocaleDateString() : String(value)
    case 'file':
      return typeof value === 'object' && value !== null && 'name' in value
        ? String((value as { name: unknown }).name)
        : ''
    default:
      return Array.isArray(value) ? value.join(', ') : String(value)
  }
}

const TEXT_INPUT_TYPES = new Set(['text', 'url', 'email', 'phone'])
const READ_ONLY_TYPES = new Set([
  'created',
  'createdBy',
  'updated',
  'updatedBy',
  'rollup',
  'formula',
  'file',
  'relation',
  'person',
  'richText',
  'dateRange',
  'geo'
])

// ─── Field editor (stacked, native controls) ─────────────────────────────────

function FieldEditor({
  field,
  value,
  onCommit,
  onCreateOption
}: {
  field: GridFieldModel
  value: CellValue | undefined
  onCommit: (value: CellValue) => void
  onCreateOption: (fieldId: string, name: string) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<string>(() =>
    TEXT_INPUT_TYPES.has(field.type) || field.type === 'number' || field.type === 'date'
      ? cellTextRaw(field, value)
      : ''
  )
  const [newTag, setNewTag] = useState('')

  function cellTextRaw(f: GridFieldModel, v: CellValue | undefined): string {
    if (v === null || v === undefined) return ''
    if (f.type === 'date' && typeof v === 'string') return v.slice(0, 10)
    return String(v)
  }

  if (TEXT_INPUT_TYPES.has(field.type)) {
    return (
      <TextInput
        style={styles.input}
        value={draft}
        placeholder="Empty"
        onChangeText={setDraft}
        onBlur={() => onCommit(draft === '' ? null : draft)}
        autoCapitalize="none"
        keyboardType={field.type === 'email' ? 'email-address' : 'default'}
        testID={`editor-${field.id}`}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <TextInput
        style={styles.input}
        value={draft}
        placeholder="Empty"
        keyboardType="numeric"
        onChangeText={setDraft}
        onBlur={() => {
          const n = parseFloat(draft)
          onCommit(Number.isFinite(n) ? n : null)
        }}
        testID={`editor-${field.id}`}
      />
    )
  }

  if (field.type === 'date') {
    return (
      <TextInput
        style={styles.input}
        value={draft}
        placeholder="YYYY-MM-DD"
        onChangeText={setDraft}
        onBlur={() => {
          if (draft === '') return onCommit(null)
          const parsed = new Date(draft)
          onCommit(Number.isNaN(parsed.getTime()) ? null : parsed.toISOString())
        }}
        testID={`editor-${field.id}`}
      />
    )
  }

  if (field.type === 'checkbox') {
    return (
      <Switch
        value={value === true}
        onValueChange={(next) => onCommit(next)}
        testID={`editor-${field.id}`}
      />
    )
  }

  if (field.type === 'select' || field.type === 'multiSelect') {
    const selected = new Set(
      field.type === 'multiSelect'
        ? Array.isArray(value)
          ? value
          : []
        : typeof value === 'string'
          ? [value]
          : []
    )
    const toggle = (optionId: string): void => {
      if (field.type === 'select') {
        onCommit(selected.has(optionId) ? null : optionId)
      } else {
        const next = new Set(selected)
        if (next.has(optionId)) next.delete(optionId)
        else next.add(optionId)
        onCommit([...next])
      }
    }
    return (
      <View>
        <View style={styles.chipRow}>
          {(field.options ?? []).map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.chip, selected.has(option.id) && styles.chipSelected]}
              onPress={() => toggle(option.id)}
            >
              <Text style={selected.has(option.id) ? styles.chipTextSelected : styles.chipText}>
                {option.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.newTagRow}>
          <TextInput
            style={[styles.input, styles.newTagInput]}
            value={newTag}
            placeholder="New tag…"
            onChangeText={setNewTag}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.newTagButton}
            disabled={!newTag.trim()}
            onPress={() => {
              const name = newTag.trim()
              if (!name) return
              setNewTag('')
              void onCreateOption(field.id, name).then((optionId) => {
                if (optionId) toggle(optionId)
              })
            }}
          >
            <Text style={styles.newTagButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Read-only / unsupported-on-mobile types
  return <Text style={styles.readOnlyValue}>{cellText(field, value) || '—'}</Text>
}

// ─── Row editor modal ────────────────────────────────────────────────────────

function RowEditor({
  row,
  fields,
  onClose,
  onUpdateCell,
  onDeleteRow,
  onCreateOption
}: {
  row: GridRowModel
  fields: GridFieldModel[]
  onClose: () => void
  onUpdateCell: (rowId: string, fieldId: string, value: CellValue) => void
  onDeleteRow: (rowId: string) => void
  onCreateOption: (fieldId: string, name: string) => Promise<string | null>
}) {
  const titleField = fields.find((f) => f.isTitle)
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.editorContainer}>
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={onClose} testID="row-editor-close">
            <Text style={styles.editorHeaderAction}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              onDeleteRow(row.id)
              onClose()
            }}
            testID="row-editor-delete"
          >
            <Text style={styles.editorHeaderDelete}>Delete</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.editorBody} keyboardShouldPersistTaps="handled">
          {titleField && (
            <TextInput
              style={styles.editorTitle}
              defaultValue={(row.cells[titleField.id] as string) ?? ''}
              placeholder="Untitled"
              onEndEditing={(e) => onUpdateCell(row.id, titleField.id, e.nativeEvent.text || null)}
              testID="row-editor-title"
            />
          )}
          {fields
            .filter((f) => f.id !== titleField?.id)
            .map((field) => (
              <View key={field.id} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>
                  {field.name}
                  {READ_ONLY_TYPES.has(field.type) ? '  (read-only on mobile)' : ''}
                </Text>
                <FieldEditor
                  field={field}
                  value={row.cells[field.id]}
                  onCommit={(value) => onUpdateCell(row.id, field.id, value)}
                  onCreateOption={onCreateOption}
                />
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function DatabaseScreen({ route }: Props) {
  const { docId } = route.params
  const grid = useGridDatabase(docId)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)

  const titleField = useMemo(() => grid.fields.find((f) => f.isTitle), [grid.fields])
  const summaryFields = useMemo(
    () => grid.visibleFields.filter((f) => f.id !== titleField?.id).slice(0, 3),
    [grid.visibleFields, titleField]
  )
  const editingRow = grid.rows.find((r) => r.id === editingRowId) ?? null

  const handleAddRow = useCallback(() => {
    void grid.addRow().then((rowId) => {
      if (rowId) setEditingRowId(rowId)
    })
  }, [grid])

  if (grid.loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={grid.rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No rows yet — add one below</Text>
          </View>
        }
        renderItem={({ item: row }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setEditingRowId(row.id)}
            testID={`row-card-${row.id}`}
          >
            <Text style={styles.cardTitle}>
              {(titleField && cellText(titleField, row.cells[titleField.id])) || 'Untitled'}
            </Text>
            {summaryFields.map((field) => {
              const text = cellText(field, row.cells[field.id])
              if (!text) return null
              return (
                <View key={field.id} style={styles.cardField}>
                  <Text style={styles.cardFieldLabel}>{field.name}</Text>
                  <Text style={styles.cardFieldValue} numberOfLines={1}>
                    {text}
                  </Text>
                </View>
              )
            })}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddRow} testID="add-row-fab">
        <Text style={styles.fabText}>＋ New row</Text>
      </TouchableOpacity>

      {editingRow && (
        <RowEditor
          row={editingRow}
          fields={grid.fields}
          onClose={() => setEditingRowId(null)}
          onUpdateCell={(rowId, fieldId, value) => {
            void grid.updateCell(rowId, fieldId, value)
          }}
          onDeleteRow={(rowId) => {
            void grid.deleteRows([rowId])
          }}
          onCreateOption={grid.createOption}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { padding: 12 },
  emptyText: { color: '#999', fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  cardField: { flexDirection: 'row', marginTop: 2 },
  cardFieldLabel: { width: 90, fontSize: 12, color: '#888' },
  cardFieldValue: { flex: 1, fontSize: 12, color: '#333' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#2563eb',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }
  },
  fabText: { color: '#fff', fontWeight: '600' },
  editorContainer: { flex: 1, backgroundColor: '#fff' },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd'
  },
  editorHeaderAction: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  editorHeaderDelete: { color: '#dc2626', fontSize: 16 },
  editorBody: { flex: 1, padding: 16 },
  editorTitle: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  fieldRow: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15
  },
  readOnlyValue: { fontSize: 15, color: '#555', paddingVertical: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    marginBottom: 6
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#444' },
  chipTextSelected: { fontSize: 13, color: '#fff' },
  newTagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  newTagInput: { flex: 1, marginRight: 8 },
  newTagButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  newTagButtonText: { color: '#fff', fontWeight: '600' }
})
