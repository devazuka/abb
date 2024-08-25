import { getDom, parseDom, toNormalizedText, makeQueue, echo, FROM_CACHE } from './lib.js'
import { updateBook } from './meili.js'

let getAADom = getDom('http://annas-archive.org')

const isDiv = node => node.tagName === 'DIV'
const notScript = node => node.tagName !== 'SCRIPT'
const isComment = node => node.nodeName === '#comment'
export const searchAA = async (query, index) => {
  const { dom, body, [FROM_CACHE]: fromCache } = await getAADom(
    `/search?${new URLSearchParams([
      ['q', query],
      ['index', index || ''],
      ['content', 'book_nonfiction'],
      ['content', 'book_fiction'],
      ['content', 'book_unknown'],
    ])}`,
    { withBody: true },
  )

  const expected = body.split('href="/md5/').length - 1
  const results = [...dom.getElementsByClassName('h-[125] flex flex-col justify-center')]
    .map(el => {
      const links = el.getElementsByTagName('A')
      if (links[0]) return links[0]
      const comment = [...el.childNodes].find(isComment)
      return comment && parseDom(comment.data).getElementsByTagName('A')?.[0]
    })
    .map((link) => {
      if (!link) return
      const [title] = link.getElementsByTagName('h3')
      if (!title) return
      const [img] = link.getElementsByTagName('img')
      const [file, edition, authors] = [...title.parentElement.children]
        .filter(isDiv)
        .map(toNormalizedText)
      return {
        aa_type: index || 'file',
        aa_title: toNormalizedText(title) || undefined,
        aa_href: link.getAttribute('href') || undefined,
        aa_poster: img?.getAttribute('src') || undefined,
        aa_file: file || undefined,
        aa_edition: edition || undefined,
        aa_authors: authors || undefined,
      }
    })
    .filter(Boolean)

  expected === results.length || echo('missing results', {
    expected,
    got: results.length
  })

  results[FROM_CACHE] = fromCache

  return results
}

export const queueAA = makeQueue(async book => {
  if (book.aa_href || book.aa_updatedAt) return { [FROM_CACHE]: true }
  const aa = await searchAA(book.name)
  updateBook({ ...aa[0], aa_updatedAt: Math.trunc(Date.now() / 1000) }, book.id)
  return aa
}, 'annas-archive')
