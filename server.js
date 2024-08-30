import { recieveResponse } from './lib.js'
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

// for some reasons, I got issues with deno, run the sync with node
/*
console.log('npm install:', await Deno.run({
  cmd: [
    ...['npm', 'ci'],
    ...['--prefer-offline', '--legacy-peer-deps'],
    ...['--no-progress', '--no-audit', '--no-fund'],
  ]
}).status())

const syncProcess = Deno.run({ cmd: ['node', 'nodeno.js'] })
*/