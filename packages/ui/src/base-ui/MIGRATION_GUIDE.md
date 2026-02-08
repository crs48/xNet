# Radix → Base UI Migration Guide

## Key API Differences

### Composition Pattern

Radix uses `asChild`:

```tsx
<Dialog.Trigger asChild>
  <Button>Open</Button>
</Dialog.Trigger>
```

Base UI uses `render`:

```tsx
<Dialog.Trigger render={<Button />}>Open</Dialog.Trigger>
```

### Naming Changes

| Radix           | Base UI         |
| --------------- | --------------- |
| Dialog.Content  | Dialog.Popup    |
| Dialog.Overlay  | Dialog.Backdrop |
| DropdownMenu    | Menu            |
| Select.Content  | Select.Popup    |
| Popover.Content | Popover.Popup   |
| Tooltip.Content | Tooltip.Popup   |

### Animation Data Attributes

Base UI provides these automatically:

- `[data-open]` - Element is open
- `[data-closed]` - Element is closed
- `[data-starting]` - Element is entering
- `[data-ending]` - Element is exiting

Use in CSS:

```css
.dialog-popup[data-starting] {
  animation: scale-in 150ms ease-out;
}
.dialog-popup[data-ending] {
  animation: fade-out 100ms ease-in;
}
```

### Portal Usage

Radix:

```tsx
<Dialog.Portal>
  <Dialog.Overlay />
  <Dialog.Content>...</Dialog.Content>
</Dialog.Portal>
```

Base UI:

```tsx
<Dialog.Portal>
  <Dialog.Backdrop />
  <Dialog.Popup>...</Dialog.Popup>
</Dialog.Portal>
```

### Focus Management

Both handle focus management automatically, but Base UI provides more granular control through props.

### Controlled vs Uncontrolled

Both support controlled and uncontrolled patterns similarly:

```tsx
// Uncontrolled
<Dialog.Root defaultOpen={false}>

// Controlled
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
```

## Component-by-Component Guide

### Accordion

```tsx
// Radix
<Accordion.Root type="single" collapsible>
  <Accordion.Item value="item-1">
    <Accordion.Trigger>...</Accordion.Trigger>
    <Accordion.Content>...</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>

// Base UI
<Accordion.Root>
  <Accordion.Item>
    <Accordion.Header>
      <Accordion.Trigger>...</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Panel>...</Accordion.Panel>
  </Accordion.Item>
</Accordion.Root>
```

### Checkbox

```tsx
// Radix
<Checkbox.Root>
  <Checkbox.Indicator>
    <CheckIcon />
  </Checkbox.Indicator>
</Checkbox.Root>

// Base UI
<Checkbox.Root>
  <Checkbox.Indicator>
    <CheckIcon />
  </Checkbox.Indicator>
</Checkbox.Root>
```

### Dialog

```tsx
// Radix
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

// Base UI
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Popup>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

### Switch

```tsx
// Radix
<Switch.Root>
  <Switch.Thumb />
</Switch.Root>

// Base UI
<Switch.Root>
  <Switch.Thumb />
</Switch.Root>
```

### Tabs

```tsx
// Radix
<Tabs.Root defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
</Tabs.Root>

// Base UI
<Tabs.Root defaultValue="tab1">
  <Tabs.List>
    <Tabs.Tab value="tab1">Tab 1</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="tab1">Content 1</Tabs.Panel>
</Tabs.Root>
```

### Tooltip

```tsx
// Radix
<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger>Hover</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content>Tooltip text</Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>

// Base UI
<Tooltip.Root>
  <Tooltip.Trigger>Hover</Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Positioner>
      <Tooltip.Popup>Tooltip text</Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
</Tooltip.Root>
```

## CSS Animation Integration

Base UI components emit data attributes that can be used for CSS animations:

```css
/* Dialog animations */
.dialog-popup[data-starting] {
  animation: scale-in var(--duration-normal) var(--ease-out);
}

.dialog-popup[data-ending] {
  animation: fade-out var(--duration-fast) var(--ease-in);
}

/* Popover/Tooltip animations */
.popover-popup[data-starting],
.tooltip-popup[data-starting] {
  animation: fade-in var(--duration-fast) var(--ease-out);
}

.popover-popup[data-ending],
.tooltip-popup[data-ending] {
  animation: fade-out var(--duration-fast) var(--ease-in);
}
```
