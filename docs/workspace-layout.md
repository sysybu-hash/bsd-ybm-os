# Workspace window layout

## Scroll ownership

- **`AdaptiveWidgetShell`** (`data-scroll-owner="shell"`) is the default scroll container for simple widgets.
- Widget roots should use `flex h-full min-h-0 flex-col overflow-hidden` so nested panes do not create competing `overflow-y-auto` regions.
- Widgets with sticky chrome (e.g. Field Copilot stepper) may use a single inner scroll: `flex-1 min-h-0 overflow-y-auto` below fixed headers.

## Anti-patterns

- Multiple nested `overflow-y-auto` on shell → widget → step.
- `h-full` without `min-h-0` in a flex column chain (breaks scroll on mobile).

## Mobile

- `workspace-window--mobile` uses safe-area padding on the shell scroll area only.
- At 100% zoom the shell scroll host uses `height: 0; flex: 1` (iOS flex fix) and `data-shell-content` grows with content (`min-h-full`, not `h-full`).
- Simple widgets: no nested `overflow-y-auto` on mobile — the shell scrolls.
- Sticky chrome (tabs, toolbars, chat input): mark the widget root with `data-widget-sticky-chrome` and the inner pane with `data-widget-scroll-pane`.
- Child steps should not add their own `overscroll-y-contain` unless they are the designated scroll owner.
