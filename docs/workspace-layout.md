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
- Child steps should not add their own `overscroll-y-contain` unless they are the designated scroll owner.
