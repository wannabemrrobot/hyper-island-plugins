# Hyper Island plugins

The registry of plugins for [Hyper Island](#): one folder per plugin, checked by CI with the same
engine and rules the island runs them with, and published as signed-off, checksummed zips that the
island lists in its plugin gallery.

## Adding a plugin

1. **Get `hi`, the plugin tool.** Unpack `tools/hi/hi-<version>-macos.tar.gz` and keep `lucide.ttf`
   beside `hi`. It runs on Apple silicon and Intel. If macOS won't open it, run
   `xattr -d com.apple.quarantine hi` once.
2. **Start a plugin.** `hi new io.github.<you>.<name>` makes a folder from the template. It includes
   the API's types (`hyper-island.d.ts`, `jsconfig.json`) and the manifest's schema, so with
   `// @ts-check` your editor checks the plugin as you type. There's no build step.
3. **Develop it live.** `hi dev <folder>` installs it on the island and reloads it each time you save,
   showing its `console.log` output and errors. It needs Developer mode (Settings › Plugins). Place
   its widget in edit mode: the pencil at the island's top right.
4. **Draw its pictures.** `hi render <folder> --png` has the island draw each widget at every size
   into the plugin's `previews/` folder: the pictures edit mode's picker shows. It draws them with
   `ctx.preview` set, so show sample content then, never what's on your Mac. Commit them with the
   plugin.
5. **Check it.** `hi check <folder> --publish` and `hi bench <folder>` must both pass.
6. **Open a pull request** that adds it as `plugins/<id>/`. The folder is named after its id.

The API is in [docs/API.md](docs/API.md), and the sizes are in [docs/SIZES.md](docs/SIZES.md). A
change to a plugin bumps its `version`; CI refuses a change that doesn't.

## What CI checks

`check.yml` runs on every pull request that touches `plugins/`. For each changed plugin, it runs:

- **`hi check --publish`:** the manifest, its icons and its script. It loads the script, runs
  `activate`, and draws every widget at every size it lists, and as its preview. Its `previews/`
  must hold a picture of each, drawn by the island. Any error fails the check.
- **`hi bench`:** what drawing each widget costs. Over the budget (p95 4 ms) fails.
- **Housekeeping:** that the folder name matches the id, and that the version went up.

## What a person reviews

CI can't judge the look. A maintainer checks each pull request against its template:

- **Sizes:** the widget reads well at every size it lists (see the island's `docs/PLUGIN_SIZES.md`).
  Its `previews/` show each size, drawn by the island itself.
- **Pictures:** they show sample content, nothing from the author's Mac, and they're what it looks
  like.
- **Rail icons:** a rail button's icon must come from the reviewed set, sized by eye. Adding an icon
  to that set is a design review in the app, not here.
- **Permissions:** each one the manifest asks for is needed for what the plugin does.
- **Nothing surprising:** no nagging schedules or live activities the user didn't ask for.

## Publishing

`publish.yml` runs when `main` changes. It packs every plugin whose version isn't published yet with
`hi pack` (a zip and its SHA-256), attaches the zips to the `plugins` release, and adds them to
`index.json`. The island downloads from there and checks each zip against its SHA-256.

## Signing

Every published zip is signed. The signature is Ed25519, over the plugin's id, its version and the
zip's SHA-256. The island installs a downloaded plugin only when that signature checks out against
the registry's public key, so it's the reviewed zip, under that name and version.

The registry's public key (the island has it built in):

    DKzqcHjO/yVh948wuFOw59xAgdNASzVdQoCEQ6OH95Y=

How it was set up, once:

1. `hi keygen` wrote the private key to `hi-signing.key` and printed the public key.
2. The private key went into this repository's Actions secrets as `HI_SIGNING_KEY`: the file's one
   line, nothing else. Anyone with it can sign as the registry, so it's kept offline and nowhere else.
3. The public key went into the app (`PluginRules.registryPublicKey`) and here. `hi pack --sign`
   refuses any other key, so a wrong secret fails the publish instead of shipping plugins the
   island won't install.

`hi verify <zip> <entry.json> --key <public key>` checks a download the way the island does.

## `hi`

`hi` is closed source, like Hyper Island itself. This repository carries its release,
`tools/hi/hi-<version>-macos.tar.gz`, pinned by SHA-256 in `tools/hi.lock`. `tools/get-hi.sh`
checks that SHA-256 before unpacking and running it, which is how CI gets it. A new `hi` comes from
the app's maintainer as a new pinned release; changes under `tools/` and `.github/` need the owner's
review (`.github/CODEOWNERS`).

## Licences

To decide before the first outside plugin:
- the licence plugins are published under (MIT, say), stated per plugin or for the whole repository;
- the terms `hi` is provided under.
