# Example extension

A minimal Chrome Manifest V3 extension using vanilla TypeScript, Vite, CRXJS,
and all five w10n modules. Requires Chrome 123+ and Node.js 20.19+ or 22.12+.

## Install and build

From `example/`:

```sh
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
and select `example/dist/prod/`. Open the extension popup and click **Open options**.
The **Example option** checkbox saves automatically and survives page reloads.
It has no other application behavior.

The example has its own dependencies and scripts. The build command runs type
checking and creates a production build using the existing copied modules.
It also packages the build as `release/prod.zip` using `vite-plugin-zip-pack`,
following the [CRXJS packaging guidelines](https://crxjs.dev/guide/packaging/).
The generated `dist/` and `release/` directories are ignored by Git.

## Development

From `example/`:

```sh
npm run dev
```

Load `example/dist/dev/` as an unpacked extension and keep the development server
running. When switching between development and production, load the corresponding
output directory in `chrome://extensions`.

Other commands, run from `example/`:

```sh
npm run tsc
npm run build
```

These commands use the existing copied modules; they do not refresh them.

## Module copies

`src/w10n/` contains committed copies of the distributable sources, mirroring
how a consumer receives modules. Application imports stay inside this example.

To refresh the copies without building, run from the repository root:

```sh
node scripts/copy-example-modules.mjs
```

The script reads `registry.json` and copies its listed files from `src/` into
`example/src/w10n/`, preserving module directories. Copying, including through `build:example`,
**overwrites edits to those copied files**. Make module changes in the root
`src/` directory and copy them again.

To refresh the copies and build together, run `npm run build:example` from the
repository root after installing the example's dependencies.

## Modules in use

| Module           | Example usage                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Storage          | Persists `exampleOption` and the optional analytics client ID.                            |
| Logger           | Logs startup and setting changes in each context's console.                               |
| Errors           | Preserves call-site stacks when opening the options page fails.                           |
| Context Menu     | Registers an **Open options** context-menu item when right-clicking the extension action. |
| Google Analytics | Optionally reports context-menu options openings and background exceptions.               |

Logging defaults to enabled through the Vite configuration. The logger still
honors an existing `loggingEnabled` preference in extension local storage.
The manifest grants only `storage` and `contextMenus` permissions.

## Optional Google Analytics

Copy `.env.example` to `.env.local` inside `example/`, then supply your own GA4
measurement ID and Measurement Protocol API secret:

```dotenv
VITE_GA_MEASUREMENT_ID=G-YOUR_MEASUREMENT_ID
VITE_GA_API_SECRET=your-api-secret
```

Restart the development server or rebuild and reload the extension after changing
these values. `.env.local` is ignored by Git. **Configured credentials are bundled
into the extension and can be inspected by anyone receiving the build.**

Without both nonblank values, analytics initialization is skipped: no analytics
client ID is created and no analytics requests are sent. With both configured,
the background persists `analyticsClientId`, enables automatic exception capture,
and sends `options_opened` with `source: 'context_menu'` after the context-menu
item successfully opens options. The popup button does not send this event.

Analytics is optional and does not block opening options. Delivery depends on
the background worker remaining alive; there is no persistent event queue.
