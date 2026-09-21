/// <reference path="./online-streaming-provider.d.ts" />

/*
 * AniKoto provider for Seanime.
 *
 * Ported and substantially adapted from Yuzono's Apache-2.0 licensed
 * Aniyomi AniKoto theme implementation:
 * https://github.com/yuzono/anime-extensions/tree/master/lib-multisrc/anikototheme
 *
 * This file is a modified work. It replaces Android/OkHttp/Jsoup integration
 * with Seanime's TypeScript extension runtime and its fetch/LoadDoc APIs.
 */

type AniKotoAnimeState = {
  path: string
  mode: "sub" | "dub"
}

type AniKotoEpisodeState = {
  ids: string
  path: string
  mode: "sub" | "dub"
  mal?: string
  slug?: string
  timestamp?: string
}

type AniKotoServer = {
  type: string
  id: string
  name: string
}

type MegaPlayTrack = {
  file: string
  label?: string
  kind?: string
  default?: boolean
}

class Provider {
  private baseUrl = "{{domain}}".replace(/\/$/, "")

  getSettings(): Settings {
    return {
      episodeServers: ["HD-1", "Vidstream-2", "VidCloud-1", "Kiwi-Stream", "VidPlay-1"],
      supportsDub: true,
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/filter?keyword=${encodeURIComponent(options.query)}&page=1`
    const response = await this.request(url)
    const $ = LoadDoc(response.text())
    const results: SearchResult[] = []
    const seen: Record<string, boolean> = {}

    $("div.ani.items > div.item").each((_index, item) => {
      const link = item.find("a.name").first()
      const href = link.attr("href") || ""
      const path = this.animePath(href)
      const title = this.decodeHtml(link.text().trim())
      if (!path || !title || seen[path]) return

      seen[path] = true
      results.push({
        id: this.encodeState({ path, mode: options.dub ? "dub" : "sub" }),
        title,
        url: this.absolute(path),
        subOrDub: options.dub ? "dub" : "sub",
      })
    })

    return results
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const state = this.decodeState<AniKotoAnimeState>(id)
    const animeResponse = await this.request(this.absolute(state.path))
    const animeDoc = LoadDoc(animeResponse.text())
    const animeId = animeDoc("[data-id]").first().attr("data-id") || animeDoc("[data-tip]").first().attr("data-tip")
    if (!animeId) throw new Error("AniKoto anime ID was not found")

    const vrf = this.vrfEncrypt(animeId)
    const listUrl = `${this.baseUrl}/ajax/episode/list/${encodeURIComponent(animeId)}?vrf=${vrf}`
    const listResponse = await this.request(listUrl, this.ajaxHeaders(this.absolute(state.path)))
    const body = listResponse.json<{ result?: string }>()
    if (!body.result) throw new Error("AniKoto returned an empty episode list")

    const $ = LoadDoc(body.result)
    const episodes: EpisodeDetails[] = []
    const seen: Record<string, boolean> = {}

    $("div.episodes ul > li > a").each((_index, element) => {
      const numberText = element.attr("data-num") || ""
      const number = Number.parseInt(numberText, 10)
      const ids = element.attr("data-ids") || ""
      const hasRequestedMode = state.mode === "dub"
        ? element.attr("data-dub") === "1"
        : element.attr("data-sub") === "1"

      if (!Number.isInteger(number) || number < 0 || !ids || !hasRequestedMode || seen[numberText]) return
      seen[numberText] = true

      const item = element.parent()
      const tooltip = item.attr("title") || ""
      const explicitTitle = item.find("span.d-title").first().text().trim()
      const tooltipTitle = tooltip.split("Release:")[0].split(/Softsub/i)[0].trim()
      const title = explicitTitle || tooltipTitle || undefined
      const episodePath = `${state.path.replace(/\/ep-\d+$/, "")}/ep-${number}`
      const episodeState: AniKotoEpisodeState = {
        ids,
        path: episodePath,
        mode: state.mode,
        mal: element.attr("data-mal") || undefined,
        slug: element.attr("data-slug") || undefined,
        timestamp: element.attr("data-timestamp") || undefined,
      }

      episodes.push({
        id: this.encodeState(episodeState),
        number,
        url: this.absolute(episodePath),
        title: title && title !== `Episode ${number}` ? title : undefined,
      })
    })

    episodes.sort((a, b) => a.number - b.number)
    return episodes
  }

  async findEpisodeServer(episode: EpisodeDetails, requestedServer: string): Promise<EpisodeServer> {
    const state = this.decodeState<AniKotoEpisodeState>(episode.id)
    const serverResponse = await this.request(
      `${this.baseUrl}/ajax/server/list?servers=${encodeURIComponent(state.ids)}`,
      this.ajaxHeaders(this.absolute(state.path)),
    )
    const payload = serverResponse.json<{ result?: string }>()
    if (!payload.result) throw new Error("AniKoto returned an empty server list")

    const servers = this.parseServers(payload.result, state.mode)
    const wanted = requestedServer === "default" ? this.getSettings().episodeServers[0] : requestedServer
    let selected = servers.find(server => this.sameServer(server.name, wanted))

    if (!selected && state.mal && state.slug && state.timestamp) {
      const mapped = await this.mapperServers(state)
      selected = mapped.find(server => this.sameServer(server.name, wanted))
    }
    if (!selected) throw new Error(`AniKoto server "${wanted}" is unavailable for this episode`)

    const embedUrl = selected.id.startsWith("http")
      ? selected.id
      : await this.resolveEmbed(selected.id, state.path)
    return this.extractServer(embedUrl, selected)
  }

  private async extractServer(embedUrl: string, server: AniKotoServer): Promise<EpisodeServer> {
    if (/mewcdn\.online\/player\/plyr\.php/i.test(embedUrl)) {
      return this.extractMewCdn(embedUrl, server)
    }
    if (/megaplay\.[^/]+\/stream\//i.test(embedUrl) || this.isMegaPlayName(server.name)) {
      return this.extractMegaPlay(embedUrl, server)
    }
    if (/\.m3u8(?:$|[?#])/i.test(embedUrl)) {
      return this.buildHlsServer(embedUrl, server, `${this.baseUrl}/`, [])
    }
    throw new Error(`AniKoto has no extractor for ${server.name}: ${embedUrl}`)
  }

  private parseServers(html: string, mode: "sub" | "dub"): AniKotoServer[] {
    const $ = LoadDoc(html)
    const servers: AniKotoServer[] = []

    $("div.servers > div.type").each((_index, typeElement) => {
      const label = this.serverType(typeElement.find("label").first().text(), typeElement.attr("data-type") || "")
      if (!this.typeMatchesMode(label, mode)) return

      typeElement.find("li").each((_serverIndex, serverElement) => {
        if (serverElement.is(".download-icon")) return
        const id = serverElement.attr("data-link-id") || ""
        const name = serverElement.text().trim()
        if (id && name) servers.push({ type: label, id, name })
      })
    })

    return servers
  }

  private async mapperServers(state: AniKotoEpisodeState): Promise<AniKotoServer[]> {
    const url = `https://mapper.nekostream.site/api/mal/${encodeURIComponent(state.mal!)}/${encodeURIComponent(state.slug!)}/${encodeURIComponent(state.timestamp!)}`
    const response = await this.request(url, {
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${this.baseUrl}/`,
      Origin: this.baseUrl,
    })
    const data = response.json<Record<string, { sub?: { url?: string }; dub?: { url?: string } } | null>>()
    const typeKey = state.mode === "dub" ? "dub" : "sub"
    const typeName = state.mode === "dub" ? "A-Dub" : "H-Sub"
    const servers: AniKotoServer[] = []

    Object.keys(data).forEach(key => {
      if (key.toLowerCase() === "status") return
      const entry = data[key]
      const url = typeKey === "dub" ? entry?.dub?.url : entry?.sub?.url
      if (url) servers.push({ type: typeName, id: url, name: this.mapperName(key) })
    })
    return servers
  }

  private async resolveEmbed(serverId: string, episodePath: string): Promise<string> {
    const response = await this.request(
      `${this.baseUrl}/ajax/server?get=${encodeURIComponent(serverId)}`,
      this.ajaxHeaders(this.absolute(episodePath)),
    )
    const data = response.json<{ result?: { url?: string } }>()
    if (!data.result?.url) throw new Error("AniKoto did not return an embed URL")
    return data.result.url
  }

  private async extractMegaPlay(embedUrl: string, server: AniKotoServer): Promise<EpisodeServer> {
    const pageResponse = await this.request(embedUrl, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${this.baseUrl}/`,
    })
    const html = pageResponse.text()
    const mediaId = html.match(/data-id=["']([^"']+)["']/i)?.[1]?.trim()
      || html.match(/File\s+(\d+)/i)?.[1]
    if (!mediaId) throw new Error("MegaPlay media ID was not found")

    const embed = new URL(embedUrl)
    const sourceUrl = new URL("/stream/getSources", embed.origin)
    sourceUrl.searchParams.set("id", mediaId)
    const sourceServer = embed.searchParams.get("s")
    if (sourceServer) sourceUrl.searchParams.set("s", sourceServer)

    const sourceResponse = await this.request(sourceUrl.toString(), {
      Accept: "application/json,*/*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: embedUrl,
    })
    const data = sourceResponse.json<{
      enc?: string
      sources?: string | { file?: string } | Array<string | { file?: string }>
      tracks?: MegaPlayTrack[]
    }>()
    const source = this.sourceFile(data.sources)
    const decrypted = data.enc ? this.decryptMegaPlay(data.enc) : undefined
    let m3u8 = decrypted || source
    if (!m3u8) throw new Error("MegaPlay returned no video source")
    if (decrypted && !/[?&]token=/i.test(m3u8)) m3u8 = this.addMegaPlayToken(m3u8)

    const subtitles = (data.tracks || [])
      .filter(track => !!track.file && !!track.label)
      .map((track, index) => ({
        id: `subtitle-${index}`,
        url: this.resolveUrl(track.file, embedUrl),
        language: track.label || "Unknown",
        isDefault: !!track.default || /english/i.test(track.label || ""),
      }))
    return this.buildHlsServer(m3u8, server, `${embed.origin}/`, subtitles)
  }

  private async extractMewCdn(embedUrl: string, server: AniKotoServer): Promise<EpisodeServer> {
    const encoded = embedUrl.split("#")[1] || ""
    if (!encoded) throw new Error("MewCDN stream fragment was not found")
    let m3u8 = Buffer.from(encoded, "base64").toString("utf8").trim()
    if (!m3u8.startsWith("http")) throw new Error("MewCDN stream URL is invalid")

    const response = await this.request(embedUrl, { Referer: `${this.baseUrl}/` })
    const mapBody = response.text().match(/var HOST_MAP\s*=\s*\{([^}]+)\}/)?.[1] || ""
    const entryPattern = /'([^']+)'\s*:\s*'([^']+)'/g
    let match: RegExpExecArray | null
    while ((match = entryPattern.exec(mapBody)) !== null) {
      if (m3u8.includes(match[1])) {
        m3u8 = m3u8.replace(match[1], match[2])
        break
      }
    }
    return this.buildHlsServer(m3u8, server, "https://mewcdn.online/", [])
  }

  private async buildHlsServer(
    masterUrl: string,
    server: AniKotoServer,
    referer: string,
    subtitles: VideoSubtitle[],
  ): Promise<EpisodeServer> {
    const origin = new URL(referer).origin
    const headers = { Referer: referer, Origin: origin }
    const videoSources: VideoSource[] = []

    try {
      const response = await this.request(masterUrl, headers)
      const lines = response.text().split(/\r?\n/)
      for (let index = 0; index < lines.length; index++) {
        if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue
        const resolution = lines[index].match(/RESOLUTION=\d+x(\d+)/i)?.[1]
        const bandwidth = lines[index].match(/BANDWIDTH=(\d+)/i)?.[1]
        const relative = lines.slice(index + 1).find(line => !!line && !line.startsWith("#"))
        if (!relative) continue
        const quality = resolution ? `${resolution}p` : bandwidth ? `${Math.round(Number(bandwidth) / 1000)}kbps` : `variant-${videoSources.length + 1}`
        if (videoSources.some(source => source.quality === quality)) continue
        videoSources.push({
          url: this.resolveUrl(relative, masterUrl),
          type: "m3u8",
          quality,
          label: `${server.name} - ${server.type}`,
          subtitles,
        })
      }
    } catch (error) {
      console.warn(`AniKoto could not inspect the HLS master playlist: ${error}`)
    }

    if (!videoSources.length) {
      videoSources.push({
        url: masterUrl,
        type: "m3u8",
        quality: "auto",
        label: `${server.name} - ${server.type}`,
        subtitles,
      })
    }
    return { server: server.name, headers, videoSources }
  }

  private decryptMegaPlay(encoded: string): string | undefined {
    try {
      const normalized = this.padBase64(encoded.replace(/-/g, "+").replace(/_/g, "/"))
      const key = new Uint8Array(32)
      const keyText = "i?LMTAx0Q6,:}50U"
      for (let index = 0; index < keyText.length; index++) key[index] = keyText.charCodeAt(index)
      const iv = CryptoJS.enc.Utf8.parse("W0;27ToaUpl_P%'c")
      const json = CryptoJS.AES.decrypt(normalized, key, { iv }).toString(CryptoJS.enc.Utf8)
      return JSON.parse(json)?.file
    } catch (error) {
      console.warn(`AniKoto MegaPlay decryption failed: ${error}`)
      return undefined
    }
  }

  private addMegaPlayToken(url: string): string {
    const match = url.match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i)
    if (!match) return url
    const payload = `${Math.floor(Date.now() / 1000) + 90}|${match[1].toLowerCase()}/${match[2].toLowerCase()}`
    const signature = this.base64Url(this.hmacSha256("MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s", payload))
    const token = `${this.base64Url(this.asciiBytes(payload))}.${signature}`
    const parsed = new URL(url)
    parsed.searchParams.set("token", token)
    return parsed.toString()
  }

  private hmacSha256(key: string, message: string): number[] {
    const block = 64
    let keyBytes = this.asciiBytes(key)
    if (keyBytes.length > block) keyBytes = this.sha256(keyBytes)
    while (keyBytes.length < block) keyBytes.push(0)
    const inner = keyBytes.map(value => value ^ 0x36).concat(this.asciiBytes(message))
    const outer = keyBytes.map(value => value ^ 0x5c).concat(this.sha256(inner))
    return this.sha256(outer)
  }

  private sha256(bytes: number[]): number[] {
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa83166d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]
    const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    const data = bytes.slice()
    const bitLength = data.length * 8
    data.push(0x80)
    while (data.length % 64 !== 56) data.push(0)
    for (let shift = 56; shift >= 0; shift -= 8) data.push(Math.floor(bitLength / Math.pow(2, shift)) & 0xff)

    for (let offset = 0; offset < data.length; offset += 64) {
      const words = new Array<number>(64)
      for (let index = 0; index < 16; index++) {
        const pos = offset + index * 4
        words[index] = ((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]) | 0
      }
      for (let index = 16; index < 64; index++) {
        const a = words[index - 15]
        const b = words[index - 2]
        const s0 = this.rotate(a, 7) ^ this.rotate(a, 18) ^ (a >>> 3)
        const s1 = this.rotate(b, 17) ^ this.rotate(b, 19) ^ (b >>> 10)
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) | 0
      }
      let [a, b, c, d, e, f, g, h] = hash
      for (let index = 0; index < 64; index++) {
        const s1 = this.rotate(e, 6) ^ this.rotate(e, 11) ^ this.rotate(e, 25)
        const choice = (e & f) ^ (~e & g)
        const temp1 = (h + s1 + choice + constants[index] + words[index]) | 0
        const s0 = this.rotate(a, 2) ^ this.rotate(a, 13) ^ this.rotate(a, 22)
        const majority = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = (s0 + majority) | 0
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0
      }
      hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0
      hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0
      hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0
      hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0
    }
    const output: number[] = []
    hash.forEach(word => output.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff))
    return output
  }

  private vrfEncrypt(input: string): string {
    let value = this.exchange(input, "AP6GeR8H0lwUz1", "UAz8Gwl10P6ReH")
    value = this.rc4("ItFKjuWokn4ZpB", value)
    value = this.rc4("fOyt97QWFB3", value)
    value = this.exchange(value, "1majSlPQd2M5", "da1l2jSmP5QM")
    value = this.exchange(value, "CPYvHj09Au3", "0jHA9CPYu3v")
    value = value.split("").reverse().join("")
    value = this.rc4("736y1uTJpBLUX", value)
    return encodeURIComponent(this.base64Url(this.asciiBytes(value), false))
  }

  private rc4(key: string, input: string): string {
    const state = Array.from({ length: 256 }, (_value, index) => index)
    let j = 0
    for (let index = 0; index < 256; index++) {
      j = (j + state[index] + key.charCodeAt(index % key.length)) & 255
      const swap = state[index]; state[index] = state[j]; state[j] = swap
    }
    const bytes = this.utf8Bytes(input)
    const output: number[] = []
    let i = 0
    j = 0
    for (const byte of bytes) {
      i = (i + 1) & 255
      j = (j + state[i]) & 255
      const swap = state[i]; state[i] = state[j]; state[j] = swap
      output.push(byte ^ state[(state[i] + state[j]) & 255])
    }
    return this.base64Url(output, false)
  }

  private exchange(input: string, source: string, target: string): string {
    return input.split("").map(character => {
      const index = source.indexOf(character)
      return index >= 0 ? target[index] : character
    }).join("")
  }

  private rotate(value: number, bits: number): number {
    return (value >>> bits) | (value << (32 - bits))
  }

  private utf8Bytes(value: string): number[] {
    const encoded = unescape(encodeURIComponent(value))
    return this.asciiBytes(encoded)
  }

  private asciiBytes(value: string): number[] {
    return value.split("").map(character => character.charCodeAt(0) & 0xff)
  }

  private base64Url(bytes: number[], stripPadding = true): string {
    const value = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_")
    return stripPadding ? value.replace(/=+$/, "") : value
  }

  private padBase64(value: string): string {
    return value + "=".repeat((4 - value.length % 4) % 4)
  }

  private sourceFile(source: string | { file?: string } | Array<string | { file?: string }> | undefined): string | undefined {
    if (typeof source === "string") return source
    if (Array.isArray(source)) {
      const first = source[0]
      return typeof first === "string" ? first : first?.file
    }
    return source?.file
  }

  private serverType(label: string, dataType: string): string {
    const value = (label || dataType).trim().toLowerCase()
    if (value === "sub") return "Sub"
    if (value === "h-sub" || value === "hsub") return "H-Sub"
    if (value === "s-sub") return "S-Sub"
    if (value === "dub") return "Dub"
    if (value === "a-dub" || value === "adub") return "A-Dub"
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown"
  }

  private typeMatchesMode(type: string, mode: "sub" | "dub"): boolean {
    return mode === "dub" ? type === "Dub" || type === "A-Dub" : type === "Sub" || type === "H-Sub" || type === "S-Sub"
  }

  private mapperName(key: string): string {
    if (/^gogoanime$/i.test(key)) return "Vidstream"
    if (/^anivibe$/i.test(key)) return "Vibe-Stream"
    if (/^animepahe$/i.test(key) || /^kiwi-stream/i.test(key)) return "Kiwi-Stream"
    return key.charAt(0).toUpperCase() + key.slice(1)
  }

  private sameServer(left: string, right: string): boolean {
    const normalize = (value: string) => value.toLowerCase().replace(/[\s-]+/g, "")
    return normalize(left) === normalize(right)
  }

  private isMegaPlayName(name: string): boolean {
    const normalized = name.toLowerCase().replace(/[\s-]+/g, "")
    return normalized.includes("vidstream") || normalized.includes("hd1") || normalized.includes("hd2")
  }

  private animePath(href: string): string | undefined {
    if (!href) return undefined
    try {
      const path = new URL(href, this.baseUrl).pathname.replace(/\/ep-\d+$/, "")
      return path.startsWith("/watch/") ? path : undefined
    } catch (_error) {
      return undefined
    }
  }

  private ajaxHeaders(referer: string): Record<string, string> {
    return {
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: referer,
      "X-Requested-With": "XMLHttpRequest",
    }
  }

  private async request(url: string, headers: Record<string, string> = {}): Promise<FetchResponse> {
    const response = await fetch(url, {
      headers: { Referer: `${this.baseUrl}/`, ...headers },
      redirect: "follow",
      timeout: 30,
    })
    if (!response.ok) throw new Error(`AniKoto request failed (${response.status}): ${url}`)
    return response
  }

  private absolute(path: string): string {
    return new URL(path, `${this.baseUrl}/`).toString()
  }

  private resolveUrl(path: string, base: string): string {
    return new URL(path, base).toString()
  }

  private encodeState(value: object): string {
    return encodeURIComponent(JSON.stringify(value))
  }

  private decodeState<T>(value: string): T {
    try {
      return JSON.parse(decodeURIComponent(value)) as T
    } catch (_error) {
      throw new Error("AniKoto received an invalid provider ID")
    }
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&#(\d+);?/g, (_match, code) => String.fromCharCode(Number(code)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  }
}
