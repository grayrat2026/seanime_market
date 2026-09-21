declare type SearchResult = { id: string; title: string; url: string; subOrDub: "sub" | "dub" | "both" }
declare type EpisodeDetails = { id: string; number: number; url: string; title?: string }
declare type VideoSubtitle = { id: string; url: string; language: string; isDefault: boolean }
declare type VideoSource = { url: string; type: "mp4" | "m3u8" | "unknown"; quality: string; label?: string; subtitles: VideoSubtitle[] }
declare type EpisodeServer = { server: string; headers: Record<string, string>; videoSources: VideoSource[] }
declare type Settings = { episodeServers: string[]; supportsDub: boolean }
declare type SearchOptions = {
  media: {
    id: number
    idMal?: number
    status?: string
    format?: string
    englishTitle?: string
    romajiTitle?: string
    episodeCount?: number
    synonyms: string[]
    isAdult: boolean
    startDate?: { year: number; month?: number; day?: number }
  }
  query: string
  dub: boolean
  year?: number
}

declare interface FetchOptions { method?: string; headers?: Record<string, string>; body?: unknown; noCloudflareBypass?: boolean; redirect?: "follow" | "manual" | "error"; timeout?: number }
declare interface FetchResponse { status: number; ok: boolean; url: string; text(): string; json<T = unknown>(): T }
declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>
declare function LoadDoc(html: string): (selector: string) => DocSelection
declare class DocSelection {
  attr(name: string): string | undefined
  each(callback: (index: number, element: DocSelection) => void): DocSelection
  find(selector: string): DocSelection
  first(): DocSelection
  parent(selector?: string): DocSelection
  text(): string
  is(selector: string): boolean
}
declare class Buffer {
  static from(value: string | ArrayLike<number>, encoding?: string): Buffer
  toString(encoding?: string): string
}
declare class WordArray { toString(encoder?: CryptoJSEncoder): string }
declare class CryptoJSEncoder { parse(input: string): Uint8Array }
declare class CryptoJS {
  static AES: { decrypt(message: string | WordArray, key: string | Uint8Array, config?: { iv?: Uint8Array }): WordArray }
  static enc: { Utf8: CryptoJSEncoder }
}
