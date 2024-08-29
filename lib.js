import { cyan, yellow, green, red, gray, blue, brightBlue, brightMagenta, brightGreen, brightRed, magenta } from "https://deno.land/std@0.224.0/fmt/colors.ts"
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'

const DISPATCHER_URL = Deno.env.get('DISPATCHER_URL') || 'https://dispatch.devazuka.com'

export const parseDom = text =>
  new DOMParser().parseFromString(text, 'text/html')

const noColor = typeof Deno?.noColor === "boolean" ? Deno.noColor : false

const getData = body => {
  try {
    const { content_html } = JSON.parse(body)
    return parseDom(`<div>${content_html}</div>`)
  } catch {
    return parseDom(body)
  }
}

export const echo = console.log

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
export const getDom = (baseUrl, { headers } = {}) => {
  const { hostname, origin } = new URL(baseUrl)
  const host = hostname.replace(/^www\./, '')
  const log = noColor ? console.log : (...args) => logReq(host, ...args)
  async function get(href, { skipCache, retry = 0, withBody } = {}) {
    let res
    try {
      res = await fetch(DISPATCHER_URL, {
        method: 'POST',
        body: JSON.stringify({ url: `${origin}${href}`, skipCache, headers })
      })
      log(res.status, href)
    } catch (err) {
      res || (res = { status: 999, text: () => err.message, err })
      log(res.status, href, 'FAILED')
    }
    if (!res.ok) {
      if (res.err?.message === 'body failed') {
        echo('retry', res.status)
        echo(truncate(await res.text()))
        return get(href, { skipCache, retry: retry + 1, withBody })
      }
      const err = Error(`${res.statusText}: ${res.status} - ${href}`)
      err.status = res.status
      err.response = res
      err.body = await res.text()
      throw err
    }
    const text = await res.text()
    const result =  withBody ? { dom: getData(text), body: text } : getData(text)
    result[FROM_CACHE] = res.headers.get('x-from-cache')
    return result
  }

  get.isFromCache = dom => dom?.[FROM_CACHE]

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

const fullfilled = value => ({ fullfilled: value })
const rejected = value => ({ rejected: value })
export const makeQueue = handler => {
  let queue = Promise.resolve()
  return {
    enqueue(value) {
      queue = queue.then(() => handler(value).then(fullfilled, rejected))
      return queue
    }
  }
}