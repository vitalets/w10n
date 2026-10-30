# Errors

Async wrappers for preserving useful error call sites and suppressing expected
failures in WebExtension code.

## Preserve an error call site

Wrap asynchronous browser calls whose rejected errors may contain only a
message:

```ts
import { withErrorStack } from './w10n/errors';

void withErrorStack(() => chrome.tabs.create({ url }));
```

`withErrorStack` accepts synchronous and asynchronous callbacks. It returns
successful values unchanged and rethrows the original failure. When an object
failure has no recognizable frames, it appends frames captured at the wrapper's
call site. Existing Chromium, Firefox, and Safari stack frames and primitive
failures stay unchanged.

Stack enrichment is best-effort because JavaScript stack strings are not
standardized. Inspection or assignment failures never replace the original
failure.

## Ignore expected errors

Call `ignoreErrors` without a message list to suppress every failure:

```ts
import { ignoreErrors } from './w10n/errors';

await ignoreErrors(() => chrome.tabs.create({ url }));
```

Pass a message list to suppress only exact, case-sensitive matches:

```ts
await ignoreErrors(() => chrome.tabs.create({ url }), ['No current window']);
```

String failures and objects with string-valued `message` properties can match.
An explicit empty list suppresses nothing. Suppressed failures resolve as
`undefined`; unmatched failures are rethrown unchanged.

The helpers can be composed when a selectively ignored browser call should
still gain caller frames for unexpected failures:

```ts
void withErrorStack(() => ignoreErrors(() => chrome.tabs.create({ url }), ['No current window']));
```

## Installation

```sh
npx shadcn@latest add vitalets/w10n/errors
```

## Updating

Give your coding agent this instruction:

```text
Update local w10n errors module from https://github.com/vitalets/w10n/tree/main/src/errors,
preserving local customizations. Ask when unsure.
```

## Permissions

No extension permissions are required by this module. Wrapped browser calls may
require their own permissions. The module has no runtime dependencies.
