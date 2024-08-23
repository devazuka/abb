import { meliProxySearch } from './meili.js'
import { proxyImage } from './image-proxy.js'

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
    return hostname === '0.0.0.0' ? responseIndex() : PAGE_INDEX
  }
  if (pathname === '/barlow-condensed.woff2') return FONT
  if (pathname === '/search') return meliProxySearch(request)
  if (pathname === '/img') return proxyImage(searchParams.get('id'))
  return PAGE_NOT_FOUND
}

export default { fetch: httpHandler }
