# Provider Roadmap

The Yuzono repository index contained 255 extension packages and 310 source records when reviewed on September 21, 2026. Language labels identify extension catalogs, not guaranteed audio or subtitle tracks.

## Priority Order

| Priority | Candidate | Reason | Marketplace status |
| --- | --- | --- | --- |
| 1 | AniKoto | Broad English sub/dub catalog and soft-sub support | Ported and live verified |
| 2 | AnimeWorld India | Best indexed candidate for Hindi and regional Indian languages | Research only; not listed |
| 3 | WcoAnimeDub | Dedicated English-dub catalog | Research only; not listed |
| 4 | WcoAnimeSub | Explicit English-subbed catalog | Research only; not listed |
| 5 | SubsPlease | Japanese audio with English subtitles | Research only; not listed |

AnimeKai, KickAssAnime, and similar sources are not ported from Yuzono here because maintained Seanime providers already exist. This marketplace references those existing manifests.

## Admission Rules

A newly ported provider is added to `plugins.json` only after all applicable checks pass:

- Search and exact-title matching
- Subbed episode retrieval
- Dubbed episode retrieval when advertised
- Server selection
- Final playback URL extraction
- A successful request to the resolved stream URL
- Subtitle extraction when the source exposes soft subtitles
- Required `Referer`, `Origin`, or other playback headers

Providers blocked by authentication, unsupported DRM, unavailable source code, incompatible licensing, or consistently inaccessible hosts will be documented instead of labeled working.
