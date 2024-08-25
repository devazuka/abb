import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { cyan, yellow, green, red, gray, blue, brightBlue, brightMagenta, brightGreen, brightRed, magenta } from "https://deno.land/std@0.224.0/fmt/colors.ts"
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'
import { encodeBase58 } from 'https://deno.land/std@0.224.0/encoding/base58.ts'
import ua from 'npm:random-useragent'

export const parseDom = text =>
  new DOMParser().parseFromString(text, 'text/html')

const noColor = typeof Deno?.noColor === "boolean" ? Deno.noColor : false

const getKey = async text =>
  encodeBase58(
    await crypto.subtle.digest('SHA-384', new TextEncoder().encode(text)),
  )

const getData = (body, withBody, fromCache) => {
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
  echo(
    color(`${p2(t.getHours())}:${p2(t.getMinutes())}`),
    yellow(String(status).padEnd(3)),
    `${coloredHost}${pathname}`,
    ...[params, detail].filter(Boolean),
  )
}

export const FROM_CACHE = Symbol('FROM_CACHE')
const p2 = n => String(n).padStart(2, '0')
const decodeValues = ([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)]
export const getDom = (baseUrl, { rate = 0, headers } = {}) => {
  let lastQueryAt = 0
  const { hostname, origin } = new URL(baseUrl)
  const host = hostname.replace(/^www\./, '')
  const log = noColor ? console.log : (...args) => logReq(host, ...args)
  async function get(href, { skipCache, onlyCache, retry = 0, withBody } = {}) {
    const key = await getKey(`${origin}${href}`)
    if (!skipCache) {
      const cache = await Deno.readTextFile(`.cache/${key}`).catch(err => err)
      if (!(cache instanceof Deno.errors.NotFound)) {
        const dom = await getData(cache, withBody, true)
        dom && (dom[FROM_CACHE] = key)
        log(200, href, brightMagenta(`CACHED:${key}`))
        return withBody ? { dom, body: cache, [FROM_CACHE]: key } : dom
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
        echo('retry', res.status)
        echo(truncate(await res.text()))
        return get(href, { skipCache, retry: retry + 1 })
      }
      const err = Error(`${res.statusText}: ${res.status} - ${href}`)
      err.status = res.status
      err.response = res
      err.body = await res.text()
      throw err
    }
    const text = await res.text()
    res.status !== 500 && (await Deno.writeTextFile(`.cache/${key}`, text))
    return withBody ? { dom: getData(text), body: text } : getData(text)
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

const timers = {}
const logTimers = (first) => {
  const now = Date.now()
  const max = Object.values(timers).reduce((a,b) => Math.max(a, b - now))
  Deno.stdout.write(
    new TextEncoder().encode(
      (first ? '': '\r')
      + Object.entries(timers)
        .map(([key, { startedAt, unlockAt}]) => `${(startedAt ? red : brightMagenta)(key)} ${toDisplayTime(startedAt ? (now - startedAt) : (unlockAt - now))}`)
        .join(' | ')
      + '\x1B[K'
    )
  )
  clearTimeout(timeoutLogTimers)
  timeoutLogTimers = setTimeout(logTimers, 251)
}


let timeoutLogTimers
export const echo = noColor ? console.log : (first, ...args) => {
  clearTimeout(timeoutLogTimers)
  timeoutLogTimers = setTimeout(logTimers, 251)
  Deno.stdout.write(new TextEncoder().encode('\r'))
  console.log(`\r${first}`, ...args, '\x1B[K')
  logTimers(true)
}
// Unlike setInterval, this one will not trigger if already active
// also, will remember once it was last trigger to not have to wait full time
// on restart
const toDisplayTime = ms => {
  if (ms <= 0) return gray('-- --')
  if (Math.abs(ms) < 60*1000) return brightGreen(`${(Math.trunc(ms /10 ) / 100).toFixed(2).padStart(5, '0')}s`)
  if (Math.abs(ms) < 60*60*1000) return blue(`${Math.trunc(ms / (60*1000))}m${String(Math.trunc(Math.abs(ms) / 1000)%60).padStart(2, '0')}s`)
  return red(`${Math.trunc(ms / (60*60*1000))}h${String(Math.trunc(Math.abs(ms) / (60*1000))%60).padStart(2, '0')}m`)
}

// TODO: add some kind of log that would tick when ever nothing was logged for a while
export const keyInterval = (key, handler, delay) => {
  timers[key] = { unlockAt: Number(localStorage[key]) || Date.now(), startedAt: 0 }
  const next = async () => {
    try {
      const start = Date.now()
      if (start < timers[key].unlockAt) return
      timers[key].startedAt = start
      const didSomething = await handler()
      if (didSomething) {
        timers[key].unlockAt = Date.now() + delay
        localStorage[key] = timers[key].unlockAt
      }
    } finally {
      timers[key].startedAt = 0
      setTimeout(next, 500)
    }
  }
  next()
}

noColor || setTimeout(logTimers, 100)

const passValue = _ => _
export const batchedInterval = (key, handler, delay) => {
  const queue = []
  keyInterval(key, async () => queue.length && handler(queue).catch(passValue), delay)
  return queue
}

export const batchedIntervalOne = (key, handler, delay) => {
  const resolvers = new WeakMap()
  const batch = batchedInterval(key, async () => {
    const item = batch.pop()
    const { resolve, reject } = resolvers.get(item) || {}
    try {
      const result = await handler(item)
      resolve?.(result)
      if (result?.[FROM_CACHE]) return
    } catch (err) {
      batch.push(item)
      reject
        ? reject(err)
        : echo(`queue failed for ${key} (${item[key]}):`, err)
    }
    return true
  }, delay)

  batch.enqueue = item => {
    batch.push(item)
    return {
      // Don't do this at work
      then(resolve, reject) {
        resolvers.set(item, { resolve, reject })
      },
    }
  }

  return batch
}

export const makeQueue = (action, resultKey, { idKey = 'id', delay = 60 * 1000 } = {}) => {
  const batch = batchedIntervalOne(resultKey, action, delay)
  const push = item => {
    if (!(item?.[idKey])) throw Error(`item missing key: ${idKey}`)
    for (const { [idKey]: id } of batch) {
      // already in the queue
      if (id === item[idKey]) return
    }
    return batch.enqueue(item)
  }

  return { push }
}
