import { crypto } from 'https://deno.land/std@0.209.0/crypto/mod.ts'
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts'
import { encodeBase58 } from 'https://deno.land/std@0.209.0/encoding/base58.ts'
import ua from 'npm:random-useragent'

export const throttle = (fn, delay) => {
  const dot = new TextEncoder().encode('.')
  const wait = async () => {
    const interval = setInterval(() => Deno.writeAllSync(Deno.stdout, dot), 1000)
    await new Promise(s => setTimeout(s, delay))
    console.log('\n')
    clearInterval(interval)
  }
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
export const getDom = (baseUrl, { rate = 0 } = {}) => {
  let lastQueryAt = 0
  return async function get(href, { skipCache, onlyCache, retry = 0 } = {}) {
    const key = `.cache/${await getKey(`${baseUrl}${href}`)}`
    if (!skipCache) {
      const cache = await Deno.readTextFile(key).catch(err => err)
      if (!(cache instanceof Deno.errors.NotFound)) {
        return getData(cache)
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
      res = await fetch(`${baseUrl}${href}`, {
        signal: controller.signal,
        // client,
        headers: {
          'user-agent': rua,
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.6',
          'sec-ch-ua': rua,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Linux"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'sec-gpc': '1',
        },
      })
      console.log(`GET: ${baseUrl}${href}`, res.status)
    } catch (err) {
      if (controller.signal.aborted) {
        console.log(`GET: ${baseUrl}${href}`, 'ABORTED')
        return get(href, { skipCache, retry: retry + 1 })
      }
      res || (res = { status: 999, text: () => err.message })
      console.log(`GET: ${baseUrl}${href}`, 'FAILED')
    }
    clearTimeout(timeout)
    if (!res.ok && res.status !== 500) {
      if (res.status === 429 || res.status === 403) {
        console.log('retry', res.status)
        console.log(await res.text())
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
