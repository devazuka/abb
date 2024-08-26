import { meliProxySearch, forEachBook } from './meili.js'
import { proxyImage } from './image-proxy.js'
import { queueGR } from './goodreads.js'
import { queueAA } from './annasarchive.js'

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
  const { pathname, hostname, searchParams } = new URL(request.url)
  if (pathname === '/') {
    const isDev = hostname === '0.0.0.0' || hostname === 'localhost'
    return isDev ? responseIndex() : PAGE_INDEX
  }
  if (pathname === '/barlow-condensed.woff2') return FONT
  if (pathname === '/search') return meliProxySearch(request)
  if (pathname === '/img') return proxyImage(searchParams.get('id'))
  return PAGE_NOT_FOUND
}

export default { fetch: httpHandler }

const syncTask = async () => {
  const after = 1724596276
  for await (const book of forEachBook({ limit: 10, reverse: true, offset: 130000 })) {
    const done = book.gr_updatedAt > after
    book.aa_href || queueAA.push(book)
    if (done) continue
    const grChanges = await queueGR.push(book)
  }
}

syncTask()