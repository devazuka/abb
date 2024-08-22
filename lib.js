import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { cyan, yellow, green, red, gray, brightBlue, brightMagenta, brightGreen, brightRed, magenta } from "https://deno.land/std@0.224.0/fmt/colors.ts"
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'
import { encodeBase58 } from 'https://deno.land/std@0.224.0/encoding/base58.ts'
import ua from 'npm:random-useragent'

export const throttle = (fn, delay) => {
  // TODO: maybe add an eventual id + localstorage to presist duration ?
  const timeoutDelay = s => setTimeout(s, delay)
  const wait = () => new Promise(timeoutDelay)
  let lastExecution = wait()
  return async (...args) => {
    const result = lastExecution.then(() => fn(...args))
    lastExecution = result.then(wait, wait)
    return result
  }
}

export const parseDom = text =>
  new DOMParser().parseFromString(text, 'text/html')

const getKey = async text =>
  encodeBase58(
    await crypto.subtle.digest('SHA-384', new TextEncoder().encode(text)),
  )
const getData = body => {
  try {
    const { content_html } = JSON.parse(body)
    return parseDom(`<div>${content_html}</div>`)
  } catch {
    return parseDom(body)
  }
}

const truncate = (text, size = Deno.consoleSize().columns) => text.length < size
  ? text
  : `${text.slice(0, size).replaceAll('\n', ' ')}…`

const colors = [cyan, yellow, green, red, brightBlue, brightMagenta, brightGreen, brightRed, magenta]
const coloredHosts = {}
export const logReq = (host, status, href, detail) => {
  const coloredHost = coloredHosts[host] || (coloredHosts[host] = colors[Object.keys(coloredHosts).length % colors.length](host))
  const color = status < 300 ? cyan : red
  const { pathname, searchParams } = new URL(`https://${host}${href}`)
  const query = searchParams.get('q')
  const params = query
    ? `${gray('q="')}${brightBlue(decodeURIComponent(query))}${gray('"')}`
    : searchParams.size && Object.fromEntries([...searchParams].map(decodeValues))
  const t = new Date()
  console.log(
    color(`${p2(t.getHours())}:${p2(t.getMinutes())}`),
    yellow(String(status).padEnd(3)),
    `${coloredHost}${pathname}`,
    ...[params, detail].filter(Boolean),
  )
}
const p2 = n => String(n).padStart(2, '0')
const decodeValues = ([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)]
export const getDom = (baseUrl, { rate = 0, headers } = {}) => {
  let lastQueryAt = 0
  const { hostname, origin } = new URL(baseUrl)
  const host = hostname.replace(/^www\./, '')
  const FROM_CACHE = Symbol('FROM_CACHE')
  const log = (...args) => logReq(host, ...args)
  async function get(href, { skipCache, onlyCache, retry = 0 } = {}) {
    const key = `.cache/${await getKey(`${origin}${href}`)}`
    if (!skipCache) {
      const cache = await Deno.readTextFile(key).catch(err => err)
      if (!(cache instanceof Deno.errors.NotFound)) {
        const dom = await getData(cache)
        dom && (dom[FROM_CACHE] = true)
        log(200, href, brightMagenta('CACHED'))
        return dom
      }
    }
    const rua = ua.getRandom()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const now = Date.now()
    const waitTime = Math.max(lastQueryAt + rate - now, retry * retry * 1000)
    await new Promise(s => setTimeout(s, waitTime))
    lastQueryAt = now + waitTime
    let res
    try {
      res = await fetch(`${origin}${href}`, {
        signal: controller.signal,
        // client,
        redirect: 'follow',
        headers: {
          'user-agent': rua,
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.6',
          'accept-encoding': 'gzip, deflate, br',
          'sec-ch-ua': rua,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Linux"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'sec-gpc': '1',
          ...headers,
        },
      })
      log(res.status, href)
    } catch (err) {
      if (controller.signal.aborted) {
        log('---', href, 'ABORTED')
        return get(href, { skipCache, retry: retry + 1 })
      }
      res || (res = { status: 999, text: () => err.message, err })
      log(res.status, href, 'FAILED')
    }
    clearTimeout(timeout)
    if (!res.ok && res.status !== 500) {
      if (res.status === 429 || res.status === 403 || res.err?.message === 'body failed') {
        console.log('retry', res.status)
        console.log(truncate(await res.text()))
        return get(href, { skipCache, retry: retry + 1 })
      }
      const err = Error(`${res.statusText}: ${res.status} - ${href}`)
      err.status = res.status
      err.response = res
      err.body = await res.text()
      console.log(err)
      return
    }
    const text = await res.text()
    res.status !== 500 && (await Deno.writeTextFile(key, text))
    return getData(text)
  }

  get.isFromCache = dom => dom?.[FROM_CACHE] === true

  return get
}

export const toText = a => {
  try {
    const enc = typeof a === 'string' ? a : a.value || a.textContent || ''
    return a ? decodeURIComponent(enc) : ''
  } catch {
    return a.value || a.textContent || ''
  }
}

export const toNormalizedText = a => toText(a).trim().replace(/\s+/g, ' ')

export const findHref = (el, method, ...args) => {
  if (!el) return
  for (const a of el.getElementsByTagName('a')) {
    const href = a.getAttribute('href')
    if (!href) continue // ??
    if (href[method](...args)) return href
  }
}

export const makeQueue = (action, resultKey, { idKey = 'id', delay = 60 * 1000 } = {}) => {
  const resolvers = new WeakMap()
  const queue = []
  setInterval(async () => {
    // TODO: handle more items as long as we hit the cache
    while (true) {
      const item = queue.pop()
      if (!item) return
      const { resolve, reject } = resolvers.get(item) || {}
      try {
        const result = await action(item)
        resolve?.(result)
        if (!action.fromCache?.(result)) return
      } catch (err) {
        push(item)
        const reject = resolvers?.reject
        reject
          ? reject(err)
          : console.warn(`queue failed for ${resultKey} (${item[idKey]}):`, err)
        return
      }
    }
  }, delay)

  const push = item => {
    if (!(item?.[idKey])) {
      throw Error(`item missing key: ${idKey}`)
    }
    if (item[resultKey]) return item
    for (const { [idKey]: id } of queue) {
      // already in the queue
      if (id === item[idKey]) return
    }
    queue.push(item)
    return {
      // Don't do this at work
      then(resolve, reject) {
        resolvers.set(item, { resolve, reject })
      },
    }
  }

  return { push }
}
