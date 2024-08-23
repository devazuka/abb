import { getDom, parseDom, toNormalizedText, makeQueue } from './lib.js'
import { updateBook } from './meili.js'

let getAADom = getDom('http://annas-archive.org')

export const setup = ({ proxyIndex, rate = 0 } = {}) => {
  getAADom = getDom('http://annas-archive.org', { proxyIndex, rate })
}

const isDiv = node => node.tagName === 'DIV'
const notScript = node => node.tagName !== 'SCRIPT'
const isComment = node => node.nodeName === '#comment'
export const searchAA = async (query, index) => {
  const dom = await getAADom(
    `/search?${new URLSearchParams([
      ['q', query],
      ['index', index || ''],
      ['content', 'book_nonfiction'],
      ['content', 'book_fiction'],
      ['content', 'book_unknown'],
    ])}`,
  )

  const [resultWrapper] = dom.getElementsByClassName('min-w-[0] w-full')
  const resultContainer = [...resultWrapper.children].find(notScript)
  let match = true
  const results = []
  for (const result of resultContainer.children) {
    if (result.tagName === 'SCRIPT') continue
    let [link] = result.getElementsByTagName('A')
    if (!link) {
      if (result.textContent.includes('partial')) {
        match = false
        continue
      }
      const hidden = [...result.childNodes].find(isComment)
      if (!hidden) continue
      link = parseDom(hidden.data).getElementsByTagName('A')[0]
      if (!link) continue
    }
    const [title] = link.getElementsByTagName('h3')
    const [img] = link.getElementsByTagName('img')
    const [file, edition, authors] = [...title.parentElement.children]
      .filter(isDiv)
      .map(toNormalizedText)
    results.push({
      aa_type: index || 'file',
      aa_match: match,
      aa_title: toNormalizedText(title) || undefined,
      aa_href: link.getAttribute('href') || undefined,
      aa_poster: img?.getAttribute('src') || undefined,
      aa_file: file || undefined,
      aa_edition: edition || undefined,
      aa_authors: authors || undefined,
    })
  }
  return results
}

export const queueAA = makeQueue(async book => {
  if (book.aa_href || book.aa_updatedAt) return
  const aa = await searchAA(book.name)
  updateBook({ ...aa[0], aa_updatedAt: Date.now() }, book.id)
}, 'aa_updatedAt')
