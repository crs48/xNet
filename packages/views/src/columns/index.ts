/**
 * Column configuration components
 *
 * Components for adding and configuring database columns:
 * - AddColumnModal: Modal for creating new columns with type picker
 * - SelectOptionsEditor: Editor for managing select/multiSelect options
 */

export {
  SelectOptionsEditor,
  getColorBg,
  type SelectOptionsEditorProps
} from './SelectOptionsEditor'

export {
  AddColumnModal,
  type AddColumnModalProps,
  type NewColumnDefinition,
  type ColumnConfig,
  type SelectOption
} from './AddColumnModal'
