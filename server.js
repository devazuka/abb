import { meliProxySearch } from './meli.js'

const PAGE_NOT_FOUND = new Response('Page not found: Error 404', { status: 404 })
const PAGE_INDEX = new Response(await Deno.readFile('./search.html'), {
  status: 200,
  headers: { 'content-type': 'text/html;charset=UTF-8' },
})

const FONT = new Response(await Deno.readFile('./barlow-condensed.woff2'), {
  status: 200,
  headers: { 'content-type': 'font/woff2' },
})

const httpHandler = (request) => {
  const { pathname } = new URL(request.url)
  if (pathname === '/') return PAGE_INDEX
  if (pathname === '/barlow-condensed.woff2') return FONT
  if (pathname === '/search') return meliProxySearch(request)
  return PAGE_NOT_FOUND
}

const port = Deno.env.get('PORT') || '7575'
export const startServer = () => {
  console.log(`HTTP server started at: http://localhost:${port}/`)
  Deno.serve({ port: Number(port) }, httpHandler)
}
