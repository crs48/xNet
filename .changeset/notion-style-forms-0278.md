---
'@xnetjs/data': minor
'@xnetjs/react': minor
---

Add the form view foundation (exploration 0278). `@xnetjs/data` gains a
`'form'` DatabaseView type with `formConfig`/`formRules`/`formAccepting`
properties, a `submissionMeta` provenance property on DatabaseRow, and a
UI-free form core (`FormViewConfig`, `FormFieldRule`, `visibleFormQuestions`,
`validateFormSubmission`, `isFormFieldTypeAllowed`,
`PUBLIC_SAFE_FORM_FIELD_TYPES`) whose show-if rules evaluate through the
existing filter engine. `@xnetjs/react`'s `useGridDatabase` exposes the form
view model plus `setFormConfig`/`setFormRules`/`setFormAccepting`, and
`addRow` accepts `AddRowOptions` (`id` for deterministic/idempotent row ids,
`meta` for submission provenance).

For public forms, `@xnetjs/data` also gains `buildPublicFormDefinition`
(the sanitized snapshot the hub serves to anonymous respondents),
`submissionRowId` (deterministic drain-time row ids from the submission
nonce), and `createRow` now accepts `id`/`submissionMeta`.
