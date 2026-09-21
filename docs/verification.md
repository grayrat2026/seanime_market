# AniKoto Verification

## Last Live Test

- Date: September 21, 2026
- Seanime source: `5rahim/seanime` `main` at `2da73d9`
- Runtime: Seanime Goja TypeScript provider runtime
- AniKoto domain: `https://anikototv.to`
- Test title: `Naruto`
- Test episode: episode 1
- Test server: `HD-1`

## Results

| Check | Sub | Dub |
| --- | --- | --- |
| Search returns exact `Naruto` result | Pass | Pass |
| Episode list | Pass: 220 | Pass: 220 |
| Server list retrieval | Pass | Pass |
| Embed resolution | Pass | Pass |
| Final HLS URL retrieval | Pass | Pass |
| Final HLS request with headers | Pass | Pass |
| Subtitle extraction | Pass: 1 track | Pass: 1 track |

The test ran `provider.ts` through Seanime's esbuild transform and Goja runtime. It did not substitute a browser or Node.js implementation for Seanime APIs.

## What This Proves

- The provider compiles under Seanime's TypeScript transform.
- Search HTML is parsed by Seanime's `LoadDoc` implementation.
- AniKoto's VRF algorithm produces accepted episode-list requests.
- Sub and dub availability flags are respected.
- AniKoto server IDs resolve to MegaPlay embeds.
- AES source decryption and HMAC playback-token generation work in Seanime.
- The final playlist can be requested with the returned headers.
- Subtitle metadata is returned in Seanime's required shape.

## Remaining Coverage

- Streaming endpoints are volatile; this result is not a permanent uptime guarantee.
- HD-1/MegaPlay received the end-to-end test. Other advertised servers are attempted independently by Seanime and may vary per episode.
- MewCDN and mapper fallback paths are implemented from upstream logic but were not selected by the tested Naruto episode.
- A host may return a single media playlist, in which case only `auto` quality is available.
