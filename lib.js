import { cyan, yellow, green, red, gray, brightBlue, brightMagenta, brightGreen, brightRed, magenta } from "https://deno.land/std@0.224.0/fmt/colors.ts"
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'

const DISPATCHER_URL = Deno.env.get('DISPATCHER_URL') || 'https://dispatch.devazuka.com'
const PORT = Deno.env.get('PORT')
const REPLY = PORT ? `http://localhost:${PORT}` : undefined

console.log({ REPLY })

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

const tryDecode = str => {
  try   { return decodeURIComponent(str) }
  catch { return str }
}

const colors = [cyan, yellow, green, red, brightBlue, brightMagenta, brightGreen, brightRed, magenta]
const coloredHosts = {}
export const logReq = (host, status, href, detail) => {
  const coloredHost = coloredHosts[host] || (coloredHosts[host] = colors[Object.keys(coloredHosts).length % colors.length](host))
  const color = status < 300 ? cyan : red
  const { pathname, searchParams } = new URL(`https://${host}${href}`)
  const query = searchParams.get('q')
  const params = query
    ? `${gray('q="')}${brightBlue(query)}${gray('"')}`
    : searchParams.size && Object.fromEntries([...searchParams].map(decodeValues))
  const t = new Date()
  echo(
    color(`${p2(t.getHours())}:${p2(t.getMinutes())}`),
    yellow(String(status).padEnd(3)),
    `${coloredHost}${pathname}`,
    ...[params, detail].filter(Boolean),
  )
}

const pendingRequests = new Map()
const sendRequest = async function get(href, { origin, log, expire, retry = 0, withBody, headers } = {}) {
    // Avoid loop spam, exponentially wait
    retry > 0 && (await new Promise(resolve => setTimeout(resolve, retry * 750)))
    let res
    const retryArgs = { origin, log, expire, retry: retry + 1, withBody }
    const signal = AbortSignal.timeout(10000)
    try {
      res = await fetch(DISPATCHER_URL, {
        method: 'POST',
        body: JSON.stringify({
          url: `${origin}${href}`,
          expire,
          headers,
          reply: REPLY,
        }),
        signal,
      })
      log(res.status, href)
    } catch (err) {
      if (signal.aborted) return sendRequest(href, retryArgs)
      res || (res = { status: 999, text: () => err.message, err })
      log(res.status, href, 'FAILED')
    }
    if (!res.ok) {
      if (res.err?.message === 'body failed') {
        echo('retry', res.status)
        echo(truncate(await res.text()))
        return sendRequest(href, retryArgs)
      }
      const err = Error(`${res.statusText}: ${res.status} - ${href}`)
      err.status = res.status
      err.response = res
      try {
        err.body = await res.text()
      } catch {
        // ignore
      }
      throw err
    }
    try {
      const fromCache = res.headers.get('x-from-cache')
      if (!fromCache) {
        const key = res.headers.get('x-request-key')
        const alreadyPending = pendingRequests.get(key)
        if (alreadyPending) {
          alreadyPending.retryArgs = retryArgs
          return alreadyPending.promise
        }
        const { promise, resolve } = Promise.withResolvers()
        pendingRequests.set(key, { promise, resolve, withBody })
        return promise
      }
      const text = await res.text()
      const result =  withBody ? { dom: getData(text), body: text } : getData(text)
      result[FROM_CACHE] = fromCache
      return result
    } catch (err) {
      echo('retry', err.message)
      return sendRequest(href, retryArgs)
    }
  }


/**
 * @param {Request} req the incoming request
 * @return {Response} the response to send
 */
export const recieveResponse = async (req) => {
  const key = req.headers.get('x-request-key')
  const pr = pendingRequests.get(key)
  if (!pr) return new Response(null, 404)
  const { resolve, withBody } = pr
  try {
    const text = await body.text()
    const result =  withBody ? { dom: getData(text), body: text } : getData(text)
    pendingRequests.delete(key)
    resolve(result)
    return new Response(null, 200)
  } catch (err) {
    echo('retry', err.message)
    return new Response(null, 500)
  }
}

export const FROM_CACHE = Symbol('FROM_CACHE')
const p2 = n => String(n).padStart(2, '0')
const decodeValues = ([k, v]) => [tryDecode(k), tryDecode(v)]
export const getDom = (baseUrl, { headers } = {}) => {
  const { hostname, origin } = new URL(baseUrl)
  const host = hostname.replace(/^www\./, '')
  const log = noColor ? console.log : (...args) => logReq(host, ...args)
  const get = (href, args) => sendRequest(href, {
    log,
    origin,
    ...args,
    headers: { ...headers, ...args?.headers },
  })
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