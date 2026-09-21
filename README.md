# Seanime Extension Marketplace: AniKoto, Subbed and Dubbed Anime Providers

A curated, Seanime-compatible extension marketplace focused on reliable online anime streaming providers for English dub, original Japanese audio with English subtitles, and future Hindi dub support.

This is not a merged Aniyomi repository. Android extensions from the [Yuzono anime extension ecosystem](https://github.com/yuzono/anime-extensions) are reviewed and ported individually to Seanime's current TypeScript provider API. A provider is listed as ported only after live search, episode, playback, subtitle, and dub/sub checks.

## Marketplace URL

Paste this URL into Seanime's extension marketplace settings:

```text
https://raw.githubusercontent.com/grayrat2026/seanime_market/main/plugins.json
```

## Installation

1. Open Seanime.
2. Go to **Extensions** and open the marketplace settings.
3. Add the raw marketplace URL shown above.
4. Refresh the marketplace.
5. Install AniKoto or any referenced upstream provider.
6. Select the installed provider in Seanime's online streaming settings.

Use a current Seanime release. The AniKoto port targets the provider API on Seanime `main` as inspected on September 20, 2026.

## Providers

| Provider | Source | Language support | Status |
| --- | --- | --- | --- |
| **AniKoto** | Ported here from Yuzono | English dub; Japanese audio with English subtitles | Live verified |
| AnimeKai | Existing Seanime manifest | English sub and dub | Upstream reference |
| HiAnime | Existing Seanime manifest | English sub and dub; soft subtitles | Upstream reference |
| AniCrush | Existing Seanime manifest | English sub and dub; soft subtitles | Upstream reference |
| KickAssAnime | Existing Seanime manifest | English sub and dub; soft subtitles | Upstream reference |
| GojoWtf | Existing Seanime manifest | English sub and dub; multiple sources | Upstream reference |
| Dub Schedule | Existing Seanime plugin | Dub schedule metadata | Upstream reference |

"Upstream reference" means this marketplace points to the original maintainer's manifest. Those extensions are not copied or claimed as this repository's work.

## AniKoto Features

- Anime title search and Seanime title matching
- Subbed and dubbed episode availability filtering
- Complete integer episode lists
- Dynamic AniKoto server-list resolution
- MegaPlay AES source decryption and signed playback tokens
- MewCDN and direct HLS handling
- HLS quality variant extraction when the host provides a master playlist
- Soft subtitle extraction and default English subtitle selection
- Playback `Referer` and `Origin` headers
- Configurable AniKoto fallback domains
- Mapper fallback support for AniKoto-linked sources

AniKoto manifest:

```text
https://raw.githubusercontent.com/grayrat2026/seanime_market/main/providers/anikoto/manifest.json
```

## Verification

AniKoto was run inside Seanime's own Goja extension runtime on September 21, 2026. The live test verified:

- Search for `Naruto` returned the exact title among the results.
- Sub mode returned 220 episodes.
- Dub mode returned 220 episodes.
- Episode 1 resolved through HD-1 to a final tokenized HLS URL in both modes.
- The resolved HLS URL was fetched successfully with playback headers.
- Subtitle extraction returned one track for both tested streams.

See [`docs/verification.md`](docs/verification.md) for scope and limitations.

## Hindi Dub Roadmap

The Yuzono index was reviewed rather than converted automatically. **AnimeWorld India** is the next high-value candidate because its indexed extension exposes Hindi plus Bengali, English, Japanese, Malayalam, Marathi, Tamil, and Telugu sources.

It is not included in `plugins.json` yet because its Seanime playback extraction has not been implemented and verified. No provider is marked working based only on compilation.

## Known Issues

- Streaming websites can change domains, anti-bot rules, encryption, and server names without notice.
- AniKoto HLS tokens are short-lived. Start playback promptly after resolving an episode.
- Not every AniKoto title has both dub and sub. Episode lists are filtered using the site's availability flags.
- HLS qualities depend on the selected host. Seanime receives `auto` when a host returns a media playlist instead of a multivariant master playlist.
- External providers referenced by this marketplace are maintained and tested by their respective upstream projects.
- This project does not host anime, video files, or subtitle files.

## Updating

1. Refresh marketplaces in Seanime to obtain changed manifests.
2. Update installed extensions when Seanime reports a newer version.
3. If AniKoto breaks, try another configured AniKoto domain before opening an issue.
4. Include the title, episode, sub/dub mode, selected server, Seanime version, and error log in bug reports. Do not include account cookies or tokens.

## Development

Repository layout:

```text
seanime_market/
├── plugins.json
├── providers/
│   └── anikoto/
│       ├── manifest.json
│       ├── NOTICE
│       ├── online-streaming-provider.d.ts
│       └── provider.ts
├── docs/
│   ├── provider-roadmap.md
│   └── verification.md
├── LICENSE
└── README.md
```

Validate JSON locally:

```bash
jq empty plugins.json providers/*/manifest.json
```

Runtime verification should use Seanime's extension playground or Seanime's Goja provider runtime. TypeScript compilation alone is not accepted as playback verification.

## Credits And License

- [Seanime](https://github.com/5rahim/seanime) by 5rahim for the extension runtime and provider API.
- [Yuzono anime extensions](https://github.com/yuzono/anime-extensions) contributors for the Apache-2.0 AniKoto implementation used as the porting reference.
- [Seanime Marketplace](https://github.com/SyntaxSama/seanime-marketplace) maintainers and provider authors for the existing extension catalog.
- kRYstall9, Thekingcrusher, and Bas1874 retain authorship and maintenance of manifests referenced from their repositories.

The code in this repository is licensed under Apache License 2.0. Upstream extensions reached through external manifest URLs retain their own licenses and copyright notices.

## Disclaimer

This repository is an interoperability project and does not host or control third-party media. Users are responsible for complying with applicable laws, service terms, and content licenses in their jurisdiction.
