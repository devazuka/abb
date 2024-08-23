import { toNormalizedText, getDom, makeQueue, FROM_CACHE } from './lib.js'
import { updateBook } from './meili.js'

const getGRDom = getDom('https://www.goodreads.com')

export const loadGoodReadsData = async q => {
  const params = { utf8: '✓', q, search_type: 'books' }
  const dom = await getGRDom(`/search?${new URLSearchParams(params)}`)
  const mainResults = [
    ...dom.querySelectorAll('[itemtype="http://schema.org/Book"]'),
  ]
  if (!mainResults.length) {
    const jsonResults = [
      ...dom.querySelectorAll('[itemtype="https://schema.org/Book"]'),
    ]
    const results = jsonResults.map(li => {
      const links = [...li.querySelectorAll('a')].map(a =>
        a.getAttribute('href'),
      )
      const { ratingCount, ratingValue } = Object.fromEntries(
        [...li.querySelectorAll('.bookRating [itemprop]')].map(i => [
          i.getAttribute('itemprop'),
          Number(i.textContent.trim().replaceAll(',', '')),
        ]),
      )
      return {
        gr_title: li.querySelector('.bookTitle')?.textContent.trim(),
        gr_thumbnail: li.querySelector('.bookCover img')?.getAttribute('src'),
        gr_authors: [...li.querySelectorAll('a.authorName')]
          .map(a => ({
            id: a
              .getAttribute('href')
              .split('/author/show/')[1]
              .split('.', 1)[0],
            name: a.textContent,
          }))
          .filter(author => author.name !== 'unknown author'),
        gr_year:
          Number(
            li
              .querySelector('.bookPublicationDate')
              ?.textContent.split('Published')[1]
              .trim(),
          ) || undefined,
        gr_bookId: li.getAttribute('id').slice('book_list_item_'.length),
        gr_workId: links
          .find(href => href.includes('/work/editions/'))
          ?.split('/work/editions/')[1]
          .split('-', 1)[0],
        gr_ratingValue: ratingValue,
        gr_ratingCount: ratingCount,
      }
    })
    results[FROM_CACHE] = dom[FROM_CACHE]
    return results
  }
  // extra info we could get from another query:
  // - description
  // - tags
  // - serie id
  // - publish date (precise)
  // - pages count
  const results = mainResults.map(tr => {
    const links = [...tr.querySelectorAll('a')].map(a => a.getAttribute('href'))
    const minirating = tr.querySelector('.minirating')
    const [ratingValue, ratingCount] = toNormalizedText(minirating.textContent)
      .split(' — ')
      .map(s => s.replace(/[^0-9.,]+/g, '').replaceAll(',', ''))
      .map(Number)
    const year =
      Number(
        [...minirating.parentNode.childNodes]
          .find(node => node.data?.includes('published'))
          ?.data.replace(/[^0-9]+/g, ''),
      ) || undefined
    return {
      gr_title: tr.querySelector('a.bookTitle')?.textContent.trim(),
      gr_thumbnail: tr.querySelector('img.bookCover')?.getAttribute('src'),
      gr_authors: [...tr.querySelectorAll('a.authorName')]
        .map(a => ({
          id: a.getAttribute('href').split('/author/show/')[1].split('.', 1)[0],
          name: a.textContent,
        }))
        .filter(author => author.name !== 'unknown author'),
      gr_year: year,
      gr_bookId: tr.querySelector('.u-anchorTarget')?.getAttribute('id'),
      gr_workId: links
        .find(href => href.startsWith('/work/editions/'))
        ?.slice('/work/editions/'.length)
        .split('-', 1)[0],
      gr_ratingValue: ratingValue,
      gr_ratingCount: ratingCount,
    }
  })
  results[FROM_CACHE] = dom[FROM_CACHE]
  return results
}

export const queueGR = makeQueue(async book => {
  if (book.gr_bookId || book.gr_updatedAt) return { [FROM_CACHE]: true }
  const gr = await loadGoodReadsData(book.name)
  updateBook({...gr[0], gr_updatedAt: Date.now() }, book.id)
  return gr
}, 'goodreads', { delay: 30*1000 })
