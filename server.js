import { recieveResponse } from './lib.js'
import { meliProxySearch, forEachBook } from './meili.js'
import { proxyImage } from './image-proxy.js'
import { queueGR } from './goodreads.js'
import { queueAA } from './annasarchive.js'
import { waitUntilNoSyncPending, syncBooks } from './mod.js'

const PAGE_NOT_FOUND = new Response('Page not found: Error 404', {
  status: 404,
})

const responseIndex = async () =>
  new Response(await Deno.readFile('./search.html'), {
    status: 200,
    headers: { 'content-type': 'text/html;charset=UTF-8' },
  })

const PAGE_INDEX = await responseIndex()
const FONT = new Response(await Deno.readFile('./barlow-condensed.woff2'), {
  status: 200,
  headers: { 'content-type': 'font/woff2' },
})

const httpHandler = request => {
  console.log(Object.fromEntries(request.headers))
  const { pathname, hostname, searchParams } = new URL(request.url)
  if (pathname === '/') {
    const isDev = hostname === '0.0.0.0' || hostname === 'localhost'
    return isDev ? responseIndex() : PAGE_INDEX
  }
  if (pathname === '/barlow-condensed.woff2') return FONT
  if (pathname === '/search') return meliProxySearch(request)
  if (pathname === '/reply') return recieveResponse(request)
  if (pathname === '/img') return proxyImage(searchParams.get('id'))
  return PAGE_NOT_FOUND
}

export default { fetch: httpHandler }

setInterval(() => {
  // big scan every day
  syncBooks({ maxPages: 50, startAt: 1 })
}, 24*60*60*1000)

setInterval(() => {
  // Full scan every week
  syncBooks({ maxPages: 500, startAt: 1 })
}, 24*60*60*1000 * 7)

let total = 0
const syncTask = async () => {
  const after = 1724596276
  await syncBooks({ maxPages: 5, startAt: 1 })
  for await (const book of forEachBook({
    limit: 100,
    reverse: true,
    offset: 130000,
  })) {
    await waitUntilNoSyncPending()
    total++
    const done = book.gr_updatedAt > after
    book.aa_href || queueAA.enqueue(book)
    if (done) continue
    const grChanges = await queueGR.enqueue(book)
    console.log({ total })
  }
}

syncTask()
