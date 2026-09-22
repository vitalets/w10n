# WXT messaging comparison

Research date: 2026-09-08. This note covers the current
[WXT messaging guide](https://wxt.dev/guide/essentials/messaging.html), the five
third-party alternatives it names, and the native WebExtension behavior on
which they build.

Package versions are the current npm releases on the research date:
`trpc-chrome` 1.0.0, `webext-bridge` 6.0.1,
`@webext-core/messaging` 4.0.0, `@webext-core/proxy-service` 3.0.2, and
`comctx` 1.7.5. Version and dependency claims below link to the corresponding
package manifests or npm pages.

## Conclusion

WXT does not provide a messaging abstraction. Its guide points users to the
native APIs and recommends five third-party packages
([WXT guide](https://wxt.dev/guide/essentials/messaging.html#alternatives)). Of
those, `@webext-core/messaging` remains the closest substitute for a small,
source-distributed `w10n` module. It already provides typed one-shot runtime and
tab/frame messages, response pairing, handler cleanup, and portable asynchronous
response handling.

The other packages solve materially larger problems:

- `@webext-core/proxy-service` turns background services into deep JavaScript
  proxies.
- `trpc-chrome` carries tRPC routers, transformers, error shapes, and
  subscriptions over long-lived ports.
- `webext-bridge` routes among all extension contexts, reconnects ports, queues
  undeliverable messages, bridges into page-world code, and provides streams.
- Comctx is a transport-agnostic RPC system with callbacks, transferables,
  provider heartbeats, and user-written adapters.

The proposed `w10n` design has **conditional go** value. Its defensible
difference is not TypeScript inference alone. It is the combination of:

- executable request-data and response schemas;
- validator independence through Standard Schema;
- a real one-way Message distinct from a response-bearing Request; and
- discoverable operation objects such as `messages.GET_ITEM.send(...)` and
  `messages.GET_ITEM.respond(...)`.

That combination is not offered by any of the five WXT-listed packages.
`trpc-chrome` comes closest on runtime input validation, but requires a tRPC v10
router and a long-lived port rather than exposing a small one-shot messaging
primitive. If `w10n` drops receiver-side data validation, sender-side response
validation, explicit error semantics, or true one-way delivery, the verdict
changes to **no-go**: the result would mostly be a novel API over functionality
already supplied by `@webext-core/messaging`.

The narrow useful scope remains internal, one-shot runtime and tab messaging.
Long-lived ports, streams, generic object proxies, page-world communication,
external-extension messaging, retries, and service discovery belong elsewhere.

## Follow-up: Proxy and runtime-validation demand

`@webext-core/messaging` does not use a JavaScript `Proxy`. Its
`defineExtensionMessaging<ProtocolMap>()` generic is erased by TypeScript, and
the implementation returns an ordinary object containing `sendMessage`,
`onMessage`, and `removeAllListeners`. The protocol map therefore provides
compile-time application data and response types only. At runtime, its generic
dispatcher checks the library envelope's `type` and `timestamp`, dispatches by
the string key, and serializes handler errors; it does not validate each
operation's data or response shape
([implementation](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/generic.ts#L91-L190)).
The separate `@webext-core/proxy-service` package is the one that exposes a
Proxy-based remote-service interface.

The public ecosystem discussion does not show consensus that runtime schemas
should be mandatory for internal extension messaging. In WXT's built-in
messaging discussion, the WXT maintainer cited validation as one reason he was
using `trpc-chrome`; another participant replied that validation is less
important in extensions than in web APIs
([discussion](https://github.com/wxt-dev/wxt/issues/643#issuecomment-2203803383),
[reply](https://github.com/wxt-dev/wxt/issues/643#issuecomment-2206089637)).
The same thread otherwise concentrates on type safety, topology, bundle
duplication, transports, and API style rather than repeatedly asking for
payload schemas. Plasmo's messaging RFC likewise concentrates on delivery
edge cases such as protected tabs, missing content scripts, and old content
scripts after an extension update
([Plasmo RFC](https://github.com/PlasmoHQ/plasmo/issues/76)). This is evidence
about ecosystem priorities, not evidence that runtime validation has no value.

Chrome's security guidance supplies the important qualification: messages from
content scripts should be treated as potentially attacker-crafted, and inputs
should be validated and sanitized before privileged work
([Chrome security guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations)).
Runtime shape validation is therefore important at content-script,
page-world, external-extension, and native-host trust boundaries. For messages
only among extension-owned background and extension-page bundles, mandatory
schemas mostly detect programming mistakes, version skew, and serialization
surprises; their value must be weighed against bundle and API cost.

The resulting recommendation is more nuanced than making schemas universal:
a general-purpose messaging module should not require executable schemas for
every trusted internal operation. It should either make validation an explicit
per-catalog/per-operation capability or clearly position itself as a narrower
validation-first module. Omitting validation entirely leaves privileged inbound
handlers without a reusable guard; requiring it everywhere taxes the common
trusted-context path and does not match current ecosystem practice.

## Follow-up: adoption and complaints

The premise that `@webext-core/messaging` is not popular is **not supported by
the available npm data**. In the latest complete npm week before this research,
it recorded 64,652 downloads, more than each of the other four packages WXT
lists alongside it. It also recorded 2,470,426 downloads in the preceding
12-month period
([weekly npm API](https://api.npmjs.org/downloads/point/2026-08-31:2026-09-06/%40webext-core%2Fmessaging),
[12-month npm API](https://api.npmjs.org/downloads/point/2025-09-01:2026-08-31/%40webext-core%2Fmessaging)).

| WXT-listed package           | npm downloads, 2026-08-31 through 2026-09-06 |
| ---------------------------- | -------------------------------------------: |
| `@webext-core/messaging`     |                                       64,652 |
| `comctx`                     |                                       55,244 |
| `@webext-core/proxy-service` |                                       21,314 |
| `webext-bridge`              |                                        7,958 |
| `trpc-chrome`                |                                           61 |

Sources: npm's point-download API for
[`comctx`](https://api.npmjs.org/downloads/point/2026-08-31:2026-09-06/comctx),
[`@webext-core/proxy-service`](https://api.npmjs.org/downloads/point/2026-08-31:2026-09-06/%40webext-core%2Fproxy-service),
[`webext-bridge`](https://api.npmjs.org/downloads/point/2026-08-31:2026-09-06/webext-bridge),
and
[`trpc-chrome`](https://api.npmjs.org/downloads/point/2026-08-31:2026-09-06/trpc-chrome).

These figures are package downloads, not unique developers or production
extensions. Some messaging installs are also transitive: the current
`@webext-core/proxy-service` manifest declares `@webext-core/messaging` as a
peer dependency
([npm registry manifest](https://registry.npmjs.org/%40webext-core%2Fproxy-service/latest)).
Conversely, the messaging package's npm page reports only eight published npm
dependents, but that number does not represent private applications or
extensions that are not themselves npm packages
([npm package page](https://www.npmjs.com/package/%40webext-core/messaging)).
No public metric here establishes a unique-user count.

GitHub stars can also create a misleading impression. The repository had 333
stars on the research date, but it is a monorepo for messaging, storage,
proxy-service, fake-browser, job-scheduler, isolated-element, and match-patterns;
GitHub provides no package-specific star count
([repository API](https://api.github.com/repos/aklinker1/webext-core),
[repository overview](https://github.com/aklinker1/webext-core)). Comparing that
shared count directly with a dedicated repository such as `webext-bridge` does
not measure the relative adoption of the two messaging packages.

The public issue history does reveal recurring limitations, but not a dominant
complaint or large dissatisfied-user cohort:

- **Narrow request-response scope.** The package intentionally rejects multiple
  listeners for an event/fan-out model; the maintainer recommends an emitter or
  `webext-bridge` for that architecture
  ([issue #19](https://github.com/aklinker1/webext-core/issues/19#issuecomment-1473957230)).
  External webpage/extension messaging was declined for lack of maintainer need
  and later closed stale
  ([issue #92](https://github.com/aklinker1/webext-core/issues/92#issuecomment-2768116403)).
  Long-lived-port support remains an open feature request
  ([issue #168](https://github.com/aklinker1/webext-core/issues/168)).
- **Page-message readiness and diagnostics.** A window/custom-event send can
  remain pending forever when no receiver is registered; the maintainer closed
  the report as not planned and noted that a timeout is the available remedy
  ([issue #69](https://github.com/aklinker1/webext-core/issues/69#issuecomment-4482683621)).
  Users also reported opaque `No response` failures for uncloneable values and
  broken bidirectional injected-script messaging; those defects were fixed
  ([issue #55](https://github.com/aklinker1/webext-core/issues/55),
  [issue #57](https://github.com/aklinker1/webext-core/issues/57)).
- **Manual setup and transport mental model.** A Plasmo-to-WXT migration report
  specifically notes that protocol types must be written manually instead of
  being generated
  ([WXT discussion #782](https://github.com/wxt-dev/wxt/discussions/782)). A
  separate report mistook runtime messaging for popup-to-content messaging and
  received `No response` until the maintainer explained that a tab ID must be
  supplied so the library uses `tabs.sendMessage`
  ([issue #100](https://github.com/aklinker1/webext-core/issues/100#issuecomment-3882324735)).
- **Historical reliability incidents.** Reports include an unbounded
  custom-event response-listener leak, Chrome 144 breaking the polyfill-based
  v3 implementation, a missing runtime dependency, and v3.0.0 being published
  without code. All were fixed; v4 dropped the polyfill and switched to the
  callback response path
  ([issue #158](https://github.com/aklinker1/webext-core/issues/158),
  [issue #126](https://github.com/aklinker1/webext-core/issues/126#issuecomment-5076870147),
  [issue #73](https://github.com/aklinker1/webext-core/issues/73),
  [issue #143](https://github.com/aklinker1/webext-core/issues/143)).

The best explanation for limited _visibility_, rather than measured low use, is
therefore an inference: this is a deliberately small, low-level package in a
fragmented niche. WXT describes several incompatible extension architectures
and lists five alternative libraries, while webext-core's own documentation
points users wanting a higher-level API toward `proxy-service`
([WXT design discussion](https://github.com/wxt-dev/wxt/issues/643),
[webext-core positioning](https://webext-core.aklinker1.io/messaging/installation)).
The missing event, external, and port transports exclude some projects, and
manual protocol declarations offer less framework magic than generated or RPC
approaches. Those factors plausibly cap mindshare; the primary sources do not
show that developers broadly avoid the package because of one fatal flaw.

## Sourced findings

### Native WebExtension constraints

Chrome distinguishes one-time requests from long-lived `Port` connections.
`runtime.sendMessage` targets another extension context, while
`tabs.sendMessage` targets content scripts in a tab
([Chrome documentation](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#simple)).

The broadly compatible asynchronous response pattern is to keep the root
listener synchronous, call `sendResponse` later, and return literal `true`.
Chrome only began gradually enabling promise-returning listeners in Chrome 148,
and that support remains unavailable in extension-script contexts when the
extension has a DevTools page. An `async` root listener also returns a promise
for every message, so it can accidentally win the response race with `null`.
Only the first listener response is used
([Chrome responses and async-listener caveats](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#responses)).

Chrome's messaging wire format uses JSON serialization, whereas other browsers
use structured clone. Chrome therefore coerces some unsupported values,
including `undefined` to `null`
([Chrome serialization](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#serialization)).
This difference makes a documented JSON-compatible payload subset the safest
portable contract.

Chrome also advises treating content-script messages as potentially
attacker-crafted and validating and sanitizing their input before privileged
operations
([Chrome security guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations)).
Static TypeScript contracts do not satisfy this runtime trust boundary.

### Terminology for one-way and response-bearing messages

The native APIs and all five WXT-listed libraries use **message** as their
broad transport term, but none of the five libraries exposes a first-class
one-way/request split. Their naming precedents are:

| System                       | Umbrella or wire unit                                  | No-response operation                                                                                              | Response-bearing operation                                             | Send and receive APIs                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome WebExtensions         | Messaging; message                                     | No distinct term; a one-time message may omit a response                                                           | The guide calls the same optional-response facility a one-time request | `runtime.sendMessage` / `tabs.sendMessage`; `runtime.onMessage` plus `sendResponse` or a returned promise ([Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#simple))                                                                                                                                                                   |
| MDN WebExtensions            | Message                                                | A `sendMessage` whose listener returns no response                                                                 | The same message with a response                                       | `runtime.sendMessage` / `tabs.sendMessage`; `runtime.onMessage` plus `sendResponse` or a returned promise ([MDN `runtime.sendMessage`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage), [`runtime.onMessage`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage))                     |
| `@webext-core/messaging`     | Message                                                | No distinct operation; a protocol entry may return `void`, but `sendMessage` still waits for its response envelope | Message                                                                | `sendMessage` / `onMessage` ([official usage](https://webext-core.aklinker1.io/messaging/installation), [implementation](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/generic.ts#L40-L190))                                                                                                                     |
| `@webext-core/proxy-service` | Service method call carried as a message               | None                                                                                                               | Proxied method call                                                    | Call a proxy from `createProxyService`; receive through `registerService` ([implementation](https://github.com/aklinker1/webext-core/blob/3f82343253e36daf16a69722ce80e67a78491f27/packages/proxy-service/src/index.ts#L25-L128))                                                                                                                                                |
| `webext-bridge`              | Message; its wire discriminant is `message` or `reply` | No true one-way operation; even a `void` protocol entry opens a transaction and receives a reply                   | Message and reply                                                      | `sendMessage` / `onMessage` ([types](https://github.com/serversideup/webext-bridge/blob/79c9f4b6a31b9b7bcdad9c13e7d4111d51338651/src/types.ts#L12-L91), [endpoint runtime](https://github.com/serversideup/webext-bridge/blob/79c9f4b6a31b9b7bcdad9c13e7d4111d51338651/src/internal/endpoint-runtime.ts#L15-L151))                                                               |
| `trpc-chrome` / tRPC         | RPC operation; procedure                               | None                                                                                                               | Query, mutation, or subscription                                       | Client procedures through `chromeLink`; background `createChromeHandler`, internally using `Port.postMessage` / `Port.onMessage` ([adapter](https://github.com/jlalmes/trpc-chrome/blob/2222b9c781fb96e4570f74aa171659349ce7e22e/src/adapter/index.ts#L26-L170), [tRPC procedures](https://trpc.io/docs/server/procedures))                                                      |
| Comctx                       | Message                                                | None at the public proxy level                                                                                     | Remote method application and callback                                 | Proxy method call through `inject`; provider through `provide`; adapters expose `sendMessage` / `onMessage` ([protocol](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/protocol.ts#L1-L34), [proxy implementation](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L8-L38)) |

Two adjacent standards provide clearer naming precedents. JSON-RPC calls its
wire unit a `Request` object, calls the no-response form a `Notification`, and
calls the correlated result a `Response`; a notification is specifically a
request without an `id`, and the server must not reply
([JSON-RPC 2.0](https://www.jsonrpc.org/specification#notification)). The web
platform's one-way `MessagePort` operation is `postMessage`, received as a
`message` event, and has no return value
([MDN `MessagePort.postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage)).
Electron makes the API shape especially explicit: one-way IPC uses `send`
paired with `on`, while two-way IPC uses `invoke` paired with `handle`
([official IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc#pattern-1-renderer-to-main-one-way)).

#### `w10n` recommendation

Keep **internal message** as the umbrella term. Call the no-response branch a
**Message** and the response-bearing branch a **Request**. On each operation
object, expose `.send(...)` / `.on(...)` for Messages and `.send(...)` /
`.respond(...)` for Requests. The `on` versus `respond` distinction reflects
the ownership rule: several listeners may observe a Message, while one
responder must own a Request key among all contexts reached by that send.

Do not use **notification** in the public API. It is the precise JSON-RPC term,
but in a WebExtension module `sendNotification`, `onNotification`, and
`Notification` would compete with Chrome's `chrome.notifications` namespace,
`NotificationOptions`, notification IDs, and the `notifications` permission.
That API creates visible system-tray notifications
([Chrome notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)).
The ambiguity is domain-local and likely to recur in imports, autocomplete,
documentation searches, and consumer code. **Event** is also a poor canonical
noun because a one-way message may be an instruction, not a fact that already
happened. **Post** and **invoke** have good precedents, but would make this small
wrapper less recognizable to developers already using WebExtension
`sendMessage` / `onMessage`.

### Proposed `w10n` design under comparison

The proposal supplies executable schemas rather than a type-only protocol map:

```ts
export const messages = defineMessages({
  APPLY_GROUPING: {},

  SAVE_SETTINGS: {
    data: z.object({
      enabled: z.boolean(),
    }),
  },

  GET_GROUPING_STATE: {
    response: z.object({
      groupableTabsCount: z.number(),
    }),
  },

  GET_ITEM: {
    data: z.object({
      itemId: z.string(),
    }),
    response: z.object({
      title: z.string(),
    }),
  },
});
```

The runtime presence of `response` classifies a Request. An entry without it is
a Message. `defineMessages` receives a real object and returns a real object
with the same uppercase own properties; no JavaScript `Proxy` or erased schema
map is required.

```ts
await messages.APPLY_GROUPING.send();
await messages.SAVE_SETTINGS.send({ enabled: true });

const state = await messages.GET_GROUPING_STATE.send();
const item = await messages.GET_ITEM.send({ itemId: '123' });

messages.SAVE_SETTINGS.on(({ enabled }, sender) => {
  // ...
});

messages.GET_ITEM.respond(async ({ itemId }, sender) => ({
  title: await loadTitle(itemId),
}));

await messages.GET_ITEM.sendToTab({ tabId, frameId }, { itemId: '123' });
```

`DataOf<typeof messages.GET_ITEM>` extracts the validated request-data type;
`ResponseOf<typeof messages.GET_ITEM>` extracts the validated response type.
Ordinary calls and callbacks infer those types without helpers.

The schema input/output distinction must be defined precisely. Standard Schema
separately exposes input and output types, permits synchronous or asynchronous
validation, and permits transformation
([Standard Schema interface and goals](https://standardschema.dev/schema#the-interface)).
The least surprising transport contract validates each untrusted value once:

- `.send(data)` accepts the data schema's input type. The receiver validates the
  wire value and passes the schema's output to `.on` or `.respond`.
- A responder returns the response schema's input type. The sender validates the
  wire response and resolves `.send()` with the schema's output type.
- `DataOf` and `ResponseOf` refer to validated output types.

Validating and transforming at both ends can apply a transform twice or make
the receiver reject the sender's transformed output. If early sender-side
preflight is desired, it must not silently replace the wire value with a value
that the receiver's schema no longer accepts. The simpler v1 rule is one
authoritative validation per direction.

Standard Schema deliberately lets an integrator accept many validation
libraries through one interface, provides standardized issues and type
inference, and can be copied rather than installed
([official design goals and FAQ](https://standardschema.dev/schema#design-goals)).
This means the copied `w10n` module needs no mandatory validation-library
dependency. It does **not** mean validation is free to the consumer: the
consumer must supply executable schemas from Zod, Valibot, ArkType, another
compatible library, or hand-written Standard Schema validators. The official
compatibility list includes those libraries and many others
([Standard Schema implementers](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec)).

Standard Schema is a validation interface, not a WebExtension serialization
format. `w10n` must independently enforce a JSON-compatible wire subset after
validation. Otherwise a schema can successfully produce a `Date`, class,
`bigint`, or another value that Chrome and Firefox transport differently.

### Direct comparison

| Option                       | Public contract                                                                                                 | Application validation                                                                                                                   | Transport and lifecycle                                                                    | Cost and fit                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Proposed `w10n`              | Runtime schema object becomes discoverable operations: `messages.NAME.send`, `.sendToTab`, `.on`, or `.respond` | Receiver validates data; sender validates responses; schemas infer both static types                                                     | One-shot runtime and tab/frame only; true Messages do not create response transactions     | No module dependency, but executable schemas and their validator ship in every importing context; narrow fit     |
| `@webext-core/messaging`     | Function-shaped type map; string-keyed `sendMessage` / `onMessage`                                              | Envelope shape only; payload and response types are compile-time assertions                                                              | One-shot runtime and tab/frame; even `void` entries use a response envelope                | One small error-serialization dependency; closest and most mature substitute                                     |
| `@webext-core/proxy-service` | Branded service key and deep method proxy                                                                       | No argument or result schemas                                                                                                            | Background-owned RPC over `@webext-core/messaging`; one-shot calls                         | Adds proxy semantics and a messaging peer; replaces a service boundary, not an event catalog                     |
| `webext-bridge`              | Module-augmented protocol map and context-specific string-keyed APIs                                            | Route/envelope checks, not application payload or reply schemas                                                                          | Background router, persistent ports, reconnection, queues, page-world bridge, and streams  | Five dependencies and much broader lifecycle machinery; replaces `w10n` only when routing or streams matter      |
| `trpc-chrome`                | Complete tRPC router exposed through a tRPC client                                                              | tRPC validates procedure input when a parser is declared; output validation follows optional router declarations, not the Chrome adapter | Caller-created long-lived port; query, mutation, and subscription operations               | Requires tRPC v10 client/server peers; valuable when the extension already uses tRPC, disproportionate otherwise |
| Comctx                       | Provider object exposed through a deep injector proxy                                                           | Envelope shape only; arguments and results are unchecked                                                                                 | User-written adapters, response messages, heartbeat, callbacks, and optional transferables | Zero dependency core, but the consumer owns WebExtension transport semantics; replaces a remote object boundary  |

The proposed API is the only row combining a small WebExtension-native one-shot
transport with library-neutral runtime schemas for both directions. That is the
value claim to test; operation-object syntax alone is not enough.

### `@webext-core/messaging`

The protocol map uses function types, for example
`getStringLength(data: string): number`, and applies the same mapping to both
`sendMessage` and `onMessage`. It supports background-bound messages and
tab/frame targeting
([official usage](https://webext-core.aklinker1.io/messaging/installation),
[published type implementation](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/generic.ts#L40-L90)).

At runtime it creates an envelope containing an ID, type, data, and timestamp.
The dispatcher validates only `type` and `timestamp`; it neither validates
payloads nor verifies that a response matches a runtime schema. It ignores
unknown formats by default, rejects duplicate handlers for one key in a realm,
and serializes handler failures into an explicit response envelope
([dispatcher source](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/generic.ts#L112-L190)).

Its extension listener uses callback-based `sendResponse` and returns literal
`true` for a handled asynchronous request, preserving compatibility with
browsers that do not support promise-returning listeners. Runtime sends inspect
`chrome.runtime.lastError`, but tab sends do not inspect it directly
([extension transport](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/extension.ts#L48-L95)).

The package also ships separate page-world messengers backed by
`window.postMessage` or `CustomEvent`. Those require a namespace and clone
values, but the window transport defaults `targetOrigin` to `*`
([page messaging source](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/src/window.ts#L33-L119)).
That facility should not be conflated with extension-internal runtime messaging.

Version 4.0.0 is ESM-only, uses the `chrome` global, and has one runtime
dependency, `@aklinker1/zero-serialize-error`
([package manifest](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/package.json),
[changelog](https://github.com/aklinker1/webext-core/blob/73bbac617902c09f198775b993cd3d24d8a241bb/packages/messaging/CHANGELOG.md#v400)).

### `@webext-core/proxy-service`

The proxy-service package creates a deep JavaScript `Proxy`; each property
access extends a method path and each call sends that path and its arguments to
the background. Registration resolves the path on the real service and calls
the selected method
([source](https://github.com/aklinker1/webext-core/blob/3f82343253e36daf16a69722ce80e67a78491f27/packages/proxy-service/src/index.ts#L25-L50),
[proxy implementation](https://github.com/aklinker1/webext-core/blob/3f82343253e36daf16a69722ce80e67a78491f27/packages/proxy-service/src/index.ts#L98-L128)).

The branded `ProxyServiceKey<T>` lets a shared key connect the client and
service types, but the wire representation deliberately falls back to
`path?: string[]` and `args: any[]`. The type safety is therefore compile-time
only at the trust boundary
([wire protocol](https://github.com/aklinker1/webext-core/blob/3f82343253e36daf16a69722ce80e67a78491f27/packages/proxy-service/src/index.ts#L58-L95)).

The official instructions require registering a service synchronously, before
awaiting background initialization, so early messages cannot arrive before its
listener exists
([official lifecycle guidance](https://webext-core.aklinker1.io/proxy-service/installation)).
Version 3.0.2 peer-depends on `@webext-core/messaging >=1.3.1`
([package manifest](https://github.com/aklinker1/webext-core/blob/3f82343253e36daf16a69722ce80e67a78491f27/packages/proxy-service/package.json)).

### `webext-bridge`

`webext-bridge` exposes context-specific entry points for background, content
scripts, DevTools, popup, options, and page-world code. Messages identify an
origin, destination, transaction, message ID, and hops; a global `ProtocolMap`
augmentation pairs application data and response types
([published types](https://github.com/serversideup/webext-bridge/blob/79c9f4b6a31b9b7bcdad9c13e7d4111d51338651/src/types.ts#L1-L100)).

Every non-background context opens a persistent `runtime.Port`. The wrapper
reconnects on disconnect, queues messages whose destination is not connected,
and synchronizes pending delivery state after reconnection
([persistent-port source](https://github.com/serversideup/webext-bridge/blob/79c9f4b6a31b9b7bcdad9c13e7d4111d51338651/src/internal/persistent-port.ts#L11-L125)).
The background is a mandatory central router. This is substantially more
machinery than a one-shot typed wrapper.

Handlers can be synchronous or asynchronous. Missing handlers produce explicit
errors, thrown handler errors are serialized, and open transactions are removed
after a reply. There is no general response timeout in the endpoint runtime
([endpoint runtime](https://github.com/serversideup/webext-bridge/blob/79c9f4b6a31b9b7bcdad9c13e7d4111d51338651/src/internal/endpoint-runtime.ts#L41-L185)).

Page-world communication is disabled until both sides set the same namespace.
The package documentation warns that a namespace prevents collisions but does
not make a page trustworthy; callers must verify origins and endpoints before
exposing privileged behavior
([published package documentation](https://www.npmjs.com/package/webext-bridge/v/6.0.1#allowwindowmessagingnamespace-string)).

The current package declares five runtime dependencies and a 166.5 kB unpacked
package size
([npm package](https://www.npmjs.com/package/webext-bridge/v/6.0.1)). The
latest npm release remains 6.0.1 from 2023, although ownership moved to Server
Side Up and the repository received new stewardship work in May 2026
([current repository](https://github.com/serversideup/webext-bridge),
[transfer discussion](https://github.com/serversideup/webext-bridge/discussions/74)).

### `trpc-chrome` and tRPC

`trpc-chrome` adapts a complete tRPC router to a long-lived extension port. The
background installs `createChromeHandler({ router, createContext?, onError? })`;
the caller adds `chromeLink({ port })` to a typed tRPC client
([official README](https://github.com/jlalmes/trpc-chrome/tree/af6cc54c66b652fee90be39b837b1b7ff8269cb5#usage)).

The handler supports tRPC operations and observable subscriptions. It tracks
subscriptions per port, stops a subscription on an explicit stop message, and
unsubscribes listeners on port disconnect
([adapter source](https://github.com/jlalmes/trpc-chrome/blob/2222b9c781fb96e4570f74aa171659349ce7e22e/src/adapter/index.ts#L26-L170)).
The client matches replies by operation ID, reconstructs tRPC errors, rejects a
premature port disconnect, and sends a stop message when a subscription is
disposed
([link source](https://github.com/jlalmes/trpc-chrome/blob/2222b9c781fb96e4570f74aa171659349ce7e22e/src/link/index.ts#L11-L92)).

The adapter performs only partial envelope checks itself. Application-level
runtime validation comes from any input/output parser declared on the tRPC
procedure; tRPC does not require an input validator
([tRPC v10 input and output validators](https://trpc.io/docs/v10/server/validators)). Errors use the
router's tRPC error shape and optional `onError` hook rather than relying on
native `onMessage` rejection semantics.

The package requires `@trpc/client` and `@trpc/server` v10 as peer dependencies
([package manifest](https://github.com/jlalmes/trpc-chrome/blob/2222b9c781fb96e4570f74aa171659349ce7e22e/package.json)).
Its only npm release was in November 2022, while tRPC's maintained line is now
v11
([tRPC releases](https://github.com/trpc/trpc/releases)). Adopting it solely for
extension messaging would impose a large, stale framework-level contract.

### Comctx

Comctx defines a transport-neutral `Adapter` with `sendMessage` and `onMessage`.
`defineProxy` creates a provider and a deep injector proxy, while options add
namespaces, heartbeat checks, transferable extraction, backup objects, and
debugging
([adapter and options](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L8-L62),
[`defineProxy`](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L429-L476)).
Its browser-extension example supplies the WebExtension transport itself; the
core does not choose between runtime messages, ports, or page events
([browser-extension example](https://github.com/molvqingtai/comctx/tree/a74bcbaab810930868c10b604b895071275e2522/examples/browser-extension)).

Comctx validates the shape of its internal envelope, including sender role,
message kind, path, namespace, and timestamp, but leaves arguments, results, and
metadata content unchecked
([protocol validation](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/protocol.ts#L24-L70)).
Provider exceptions are reduced to `error.message` and rebuilt as a plain
`Error` on the injector
([RPC execution](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L230-L306),
[response handling](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L369-L400)).

The default heartbeat polls for a provider before each remote apply and rejects
after one second if none responds. It does not impose a timeout on the ensuing
method response
([heartbeat source](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/core/src/comctx.ts#L64-L115)).
Comctx has no runtime dependencies, claims a 2 KB gzipped core, and was actively
released through June 2026
([README](https://github.com/molvqingtai/comctx/tree/a74bcbaab810930868c10b604b895071275e2522#features),
[changelog](https://github.com/molvqingtai/comctx/blob/a74bcbaab810930868c10b604b895071275e2522/CHANGELOG.md#175-2026-06-15)).

## Value assessment for the proposed `w10n` design

The following judgments are derived from the sourced behavior above; they are
not claims made by WXT or the compared packages.

### Where it provides real value

1. **Runtime validation is a genuine differentiator.**
   `@webext-core/messaging`, proxy-service, `webext-bridge`, and Comctx validate
   their own routing envelopes but trust application values. `trpc-chrome` can
   validate procedure input and output through tRPC v10 declarations, but that
   is a full RPC router transported over a caller-managed port. A small module
   that always validates incoming data and incoming responses fills a real gap.

2. **The schema is the static and runtime source of truth.** The same inline
   entry drives call arguments, listener data, responder results, resolved
   responses, and exported `DataOf` / `ResponseOf` helpers. This avoids the
   common failure where a TypeScript protocol claims one shape while the wire
   carries another. Standard Schema's structural interface keeps `w10n`
   independent of a particular validator.

3. **Operation objects are more discoverable than string-keyed functions.**
   `messages.GET_ITEM.send(...)` exposes the catalog through property
   autocomplete, has no repeated message-name string, and makes the valid
   receive method visible on the same value. An ordinary returned object is
   enumerable and debuggable, unlike a dynamic deep RPC proxy. This is a useful
   ergonomic improvement, though not sufficient value by itself.

4. **Messages and Requests have honestly different semantics.** A Message has
   `.on` and no response transaction; a Request has `.respond` and validates one
   response. `@webext-core/messaging` and `webext-bridge` send a reply even when
   the declared result is `void`. The proposed split makes fan-out and
   completion semantics visible rather than encoding them as `void`.

5. **The module stays close to the platform.** It can hide the versioned
   envelope, `runtime.lastError`, callback-compatible asynchronous responses,
   error serialization, listener cleanup, and runtime-versus-tab send mechanics
   without introducing ports, a router, service proxies, or framework concepts.
   This is appropriate for copied source that consumers are expected to inspect
   and modify.

### Costs and limitations

1. **Runtime validation moves cost into every extension context.** A shared
   `messages` object contains live schemas, so importing it into background,
   popup, options, and content-script bundles can retain the validator and the
   entire catalog in each bundle. A single grouped object may also prevent
   property-level tree shaking. Standard Schema removes an adapter dependency;
   it does not remove the consumer's schema-library bytes or validation work.

2. **The route-free catalog cannot prevent topology mistakes.** Chrome's
   `runtime.sendMessage` fires in every other extension page, not specifically
   in the background
   ([MDN runtime delivery](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage)).
   TypeScript therefore cannot stop a caller from using `.send()` for an
   operation whose responder lives elsewhere, or `.sendToTab()` for a
   background operation. `webext-bridge` has stronger explicit destination
   routing; proxy-service has stronger background ownership.

3. **Request ownership is a cross-context convention.** The module can reject
   duplicate `.respond()` registrations in one JavaScript realm, but it cannot
   detect responders in two open extension pages. Chrome uses only the first
   response when several listeners answer
   ([Chrome response race](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#responses)).
   Requests should normally have one background responder, and the
   documentation must say so.

4. **Tab Requests need a singular target.** Without `frameId` or `documentId`,
   `tabs.sendMessage` reaches every matching frame, and if several respond the
   selected response is unspecified
   ([MDN tab-message responses](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/sendMessage)).
   A Request's `.sendToTab` should require a singular frame/document target or
   explicitly document the race. A Message may intentionally fan out to all
   frames.

5. **Validation is not authorization.** A valid content-script payload may
   still be hostile. Responders must receive `chrome.runtime.MessageSender`, and
   privileged operations must inspect sender identity and application
   permissions as appropriate. Chrome explicitly warns that content-script
   input may be attacker-crafted
   ([Chrome security guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations)).

6. **Validation is not serialization.** Chrome uses JSON serialization while
   other browsers use structured clone. Schema success alone cannot promise
   cross-browser equivalence. The module needs a separate JSON-compatible check
   and must specify whether schema transforms are allowed.

7. **Schema failures for one-way Messages are receiver-local.** A true Message
   cannot both avoid a reply and report receiver validation or listener failure
   to the sender. The module needs an observable receiver-side error hook or a
   documented logging behavior. Consumers that need acknowledgement must define
   a Request.

8. **It deliberately does not replace the broader packages.** Choose
   `webext-bridge` for named context routing, reconnection, queues, streams, or
   page-world bridging; proxy-service or Comctx for remote-object semantics; and
   `trpc-chrome` when an existing tRPC v10 router and subscriptions justify its
   port lifecycle. `w10n` should not grow those features merely to match a
   comparison table.

### Conditions for a credible v1

The proposal earns a **go** only if the implementation and documentation make
these properties non-optional:

1. Every operation carrying data has a Standard Schema data validator; every
   Request has a Standard Schema response validator. There is no type-only
   escape hatch presented as safe.
2. Incoming data is validated before `.on` / `.respond`; incoming Request
   responses are validated before `.send` / `.sendToTab` resolves. The schema
   input/output and transformation rules are tested explicitly.
3. The envelope has a module marker, protocol version, operation name, and
   Message/Request kind. Malformed or foreign envelopes are ignored without
   claiming their response channel.
4. A separate recursive check enforces the documented JSON-compatible wire
   subset. Runtime schemas do not substitute for that check.
5. Handler failures and validation failures use stable error codes and an
   explicit success/error response envelope. Native delivery errors are
   normalized consistently for runtime and tab sends; remote stacks and custom
   error fields are not promised.
6. The root listener remains synchronous and returns literal `true` only for a
   recognized asynchronous Request. This avoids the current cross-browser and
   DevTools caveats around promise-returning listeners
   ([Chrome compatibility guidance](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#responses)).
7. `.on` allows multiple listeners; `.respond` permits one responder per
   operation per realm; every registration returns idempotent cleanup; the root
   listener is installed lazily and removed when unused.
8. `.send()` resolves after native dispatch, not listener completion.
   `.sendToTab()` preserves `tabId`, `frameId`, and preferably `documentId`
   targeting. Neither operation retries an unknown side effect.
9. Operation names are unique across the extension, or `defineMessages` accepts
   a stable runtime namespace. Multiple independent catalogs with the same
   uppercase key must not accidentally handle each other's traffic.
10. Bundle measurements cover at least one small validator and one common large
    validator across background, extension-page, and content-script builds.
    Documentation recommends splitting catalogs when one global object causes
    avoidable schema duplication.
11. Tests cover Chrome-style JSON behavior and at least Firefox compatibility;
    Safari support is claimed only after an actual compatibility check.

### Final verdict

**Go, as a validation-first one-shot messaging module.** The strongest pitch is:
“runtime-validated request data and responses, inferred from any Standard
Schema validator, with a small WebExtension-native API.” That is real and
meaningfully different from `@webext-core/messaging`.

**No-go as merely another typed wrapper.** If validation is optional in normal
usage, schema bytes make typical bundles unreasonable, route ambiguity is left
undocumented, or errors and cleanup remain browser-dependent, consumers should
use `@webext-core/messaging` instead. The operation-object syntax is pleasant,
but syntax alone does not justify a new module.
