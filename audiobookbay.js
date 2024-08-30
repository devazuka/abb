import {
  getDom,
  parseDom,
  toNormalizedText,
  toText,
  findHref,
  echo,
} from './lib.js'

export let ABBOrigin = 'http://theaudiobookbay.se'

// We do this check asynchronously because sometimes abb is down
// and we don't want to prevent the service to start if it is.
fetch('http://185.247.224.117', { redirect: 'manual' }).then((ipResponse) => {
  const location = ipResponse.headers.get('location')
  location && (ABBOrigin = location)
  getABBDom = getDom(ABBOrigin)
})

export let getABBDom = getDom(ABBOrigin)

const getValue = (key, el) => {
  const content = el.getAttribute('content')
  if (content) return [key, content]
  if (el.tagName === 'IMG') return [key, el.getAttribute('src')]
  if (key === 'author') return [el.className, toNormalizedText(el)]
  if (key === 'description') {
    return [
      key,
      [...el.querySelectorAll('p')].slice(1).map(toNormalizedText).join('\n'),
    ]
  }
  return [key, toNormalizedText(el)]
}

const blackListedKeys = new Set([
  'torrentDownload',
  'tips',
  'directDownload',
  'securedDownload',
])

const blackListedInfos = new Set([
  'Announce URL',
  'This Torrent also has several backup trackers',
  'This is a Multifile Torrent',
  'AD',
])

const push = (data, k, v) => {
  if (!v?.length || !k?.length) return
  k = `${k[0].toLowerCase()}${k.slice(1).replaceAll(' ', '')}`
  if (blackListedKeys.has(k)) return
  if (k === 'info' && blackListedInfos.has(v)) return
  if (k === 'datePublished' || k === 'uploadDate' || k === 'creationDate') {
    const time = new Date(v).getTime()
    time && (v = Math.trunc(time / 1000))
  }
  if (Array.isArray(data[k])) {
    data[k].push(v)
  } else if (data[k]) {
    data[k] = [data[k], v]
  } else {
    data[k] = v
  }
}

const parseSchema = (el, item = {}) => {
  const itemType = el.getAttribute('itemtype')
  const itemprop = el.getAttribute('itemprop')
  if (itemType) {
    if (!itemType.endsWith('Person')) return
  }

  if (el.children) {
    for (const child of el.children) parseSchema(child, item)
  }

  if (!itemprop) return
  const [key, value] = getValue(itemprop, el)
  push(item, key, value)
}

export const getABB = async key => {
  const dom = await getABBDom(`/abss/${key}/`)
  const schemas = { author: [], narrator: [] }
  for (const child of dom.querySelector(
    '[itemtype="https://schema.org/Audiobook"]',
  ).children) {
    parseSchema(child, schemas)
  }

  const postInfo = dom.querySelector('.postInfo')
  schemas.cat = [...postInfo.querySelectorAll('[rel="category tag"]')].map(
    toNormalizedText,
  )

  schemas.tag = [...postInfo.querySelectorAll('a')]
    .filter(a => a.getAttribute('href').includes('/tag/'))
    .map(toNormalizedText)

  const [descriptionBlock, ...textBlocks] =
    dom.querySelector('[itemprop="description"]')?.children || []
  if (descriptionBlock) {
    for (const span of descriptionBlock.querySelectorAll('span')) {
      push(schemas, span.attributes.class, span.textContent)
    }
    // Extract description text
    schemas.description = textBlocks.map(toNormalizedText)
  } else {
    // Legacy parsing
    const [descriptionBlock, ...textBlocks] = [
      ...dom.querySelectorAll('.postContent p'),
    ].slice(3)
    const content = descriptionBlock?.textContent || ''
    for (const line of content.split('\n')) {
      push(schemas, 'info', line)
    }
    schemas.description = textBlocks.map(toNormalizedText)
  }

  const tracker = []
  const torrentInfo = { tracker }
  for (const { children } of dom.querySelectorAll('.torrent_info tr')) {
    const [key, value] = children
    if (!key || !value) continue
    const kk = toText(key)
    if (kk === 'AD:') continue
    if (kk === 'Tips:') continue
    if (kk === 'Tracker:') {
      tracker.push(toText(value))
      continue
    }
    if (kk === 'Announce URL:') continue
    if (kk.endsWith('Download:')) continue
    const k = `${kk[0].toLowerCase()}${kk.slice(1, -1).replaceAll(' ', '')}`
    torrentInfo[k] = toText(value)
  }
  torrentInfo.magnet = `magnet:?xt=urn:btih:${torrentInfo.infoHash}&${new URLSearchParams(
    [
      ['dn', decodeURIComponent(key)],
      ...torrentInfo.tracker.map(t => ['tr', t]),
    ],
  )}`

  return {
    id: torrentInfo.infoHash,
    ...torrentInfo,
    ...schemas,
    url: `${ABBOrigin}abss/${key}/`,
    slug: key,
  }
}

// id
// url
// title
// img
// inLanguage
// tag
// author
// narrator
// format
// bitrate
// is_abridged
// description
// announceURL
// tracker
// creationDate
// info
// combinedFileSize
// pieceSize
// comment
// encoding
// infoHash
// magnet
// slug

export const getABBPageResults = async page => {
  const dom = await getABBDom(page === 1 ? '' : `/page/${page}/`, {
    expire: 3*60*1000,
  })
  const results = [...dom.getElementsByClassName('post')]
  return results.map(function parse(el) {
    const titleLink = el.querySelector('.postTitle a')
    const content = el.querySelector('.postContent')
    const memberLink = findHref(el, 'includes', '/member/users/index')
    if (!memberLink) {
      // For some reason, sometimes, it's base64 enc??
      // probably the random UA
      try {
        const decoded = atob(el.innerHTML)
        return parse(parseDom(decoded))
      } catch (err) {
        echo('ABB Error:', err)
        return {}
      }
    }
    return {
      title: titleLink?.textContent,
      href: titleLink?.getAttribute('href'),
      key: titleLink?.getAttribute('href').split('/abss/')[1].slice(0, -1),
      user: new URLSearchParams(memberLink.split('?')[1]).get('username'),
      img: content.getElementsByTagName('img')[0]?.getAttribute('src'),
    }
  })
}
