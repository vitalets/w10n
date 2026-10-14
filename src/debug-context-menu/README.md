# Debug Context Menu

Development commands in the extension toolbar action's DEBUG submenu.

## Key behavior

- Turns an array of labeled commands into a DEBUG submenu with automatic click handling.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/debug-context-menu
```

## Usage

```ts
import { createDebugContextMenu } from './w10n/debug-context-menu';

async function initDebugMenu() {
  if (import.meta.env.MODE !== 'development') return;
  await createDebugContextMenu([
    {
      title: 'Show Welcome',
      run: () => {
        // ...
      },
    },
  ]);
}

void initDebugMenu();
```

Each command has a `title` and a `run` callback. Callbacks may be synchronous or
asynchronous and may return any value. Use an arrow callback when calling an
object's method to preserve its receiver.

## Requirements

Declare the `contextMenus` permission and use a Manifest V3 service worker.
The Promise form of `chrome.contextMenus.remove()` requires Chrome 123 or newer.
Call the function once, synchronously during worker initialization, so its click
listener is registered before any asynchronous work. The caller controls whether
the menu is enabled in development; this module has no build-tool dependency.

## Lifecycle and errors

The returned promise resolves after menu registration finishes. Item IDs are
generated from array positions under the reserved `w10n-debug` prefix; consumers
must not use that prefix for other items. Registration replaces only this submenu
and its children, removing stale commands after a worker restart. An empty array
removes the submenu. Other extension items remain untouched.

A missing previous submenu is expected. If creating the new menu fails, the
promise rejects and its click listener is removed. A partially created submenu
may remain until the next worker startup. Command errors are not suppressed;
consumers should handle them in their callbacks if needed. Repeated calls within
the same worker are not supported.
