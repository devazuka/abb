import { cyan, yellow, green, red, gray, blue, brightBlue, brightMagenta, brightGreen, brightRed, magenta } from "https://deno.land/std@0.224.0/fmt/colors.ts"
import { meliProxySearch, meli,  } from './meili.js'
import { proxyImage } from './image-proxy.js'
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
  if (pathname === '/img') return proxyImage(searchParams.get('id'))
  return PAGE_NOT_FOUND
}

export default { fetch: httpHandler }

setInterval(() => {
  // big scan every day
  // syncBooks({ maxPages: 50, startAt: 1 })
}, 24*60*60*1000)

setInterval(() => {
  // Full scan every week
  // syncBooks({ maxPages: 500, startAt: 1 })
}, 24*60*60*1000 * 7)

const syncTask = async () => {
  await syncBooks({ maxPages: 5, startAt: 1 })
  /*
  let total = 0
  const _ = s => magenta(String(s).padStart(2, '0'))
  while (true) {
    const hits = (await meli('/indexes/audiobooks/search', {
      q: '',
      sort: ['gr_updatedAt:asc'],
      limit: 25,
    }))?.hits || []
    for (const book of hits) {
      await waitUntilNoSyncPending()
      total++
      const diffSec = Math.round(Date.now() /1000) - book.gr_updatedAt
      const mm = Math.trunc(diffSec / 60) % 60
      const hh = Math.trunc(diffSec / 60 / 60) % 24
      const dd = Math.trunc(diffSec / 60 / 60 / 24)
      console.log(`${_(dd)}j${_(hh)}h${_(mm)}m${_(diffSec%60)}s`, diffSec)
      book.aa_href || queueAA.enqueue(book)
      const grChanges = await queueGR.enqueue(book) 
      console.log({ total })
    }
  }
  */
  setTimeout(syncTask, 60000)
}

syncTask()
