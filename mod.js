import { keyInterval, echo } from './lib.js'
import { queueGR } from './goodreads.js'
import { waitForAllBookUpdates, updateBook, documentExists, meli, forEachBook } from './meili.js'
import { queueAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'

// Because AA as a strict rate limiting we run those query with a delay

const syncBooks = ({ maxPages = 3, startAt = 1, step = 1 } = {}) => async () => {
  let i = startAt
  let total = 0
  let scanned = 0
  let emptyPages = 0
  while (i > 0 && i <= 500) {
    let newBooks
    while (true) {
      try {
        newBooks = []
        const bs = await getABBPageResults(i)
        scanned += bs.length
        for (const b of bs) {
          let book = await documentExists(b.key)
          if (!book?.name) {
            book = await getABB(b.key)
            updateBook(book)
            newBooks.push(book)
          }
          book.gr_updatedAt || queueGR.push(book)
          book.aa_updatedAt || queueAA.push(book)
        }
        break
      } catch (err) {
        echo('unexpected error in main loop:', err)
        echo('retry...')
      }
    }
    emptyPages += !newBooks.length
    if (emptyPages > maxPages) break
    total += newBooks.length
    i += step
  }
  await waitForAllBookUpdates()
  echo(`total books added: ${total}/${scanned}`, total)
  return true
}

keyInterval('check-home-page-1h', syncBooks({
  maxPages: 10,
  startAt: 1,
}), 1000 * 60 * 60)


/*
setInterval(
  () =>
    (pendingSync = Promise.resolve(pendingSync).then(() =>
      syncBooks({ maxPages: 300 }),
    )),
  1000 * 60 * 60 * 24,
)
*/
// pendingSync = syncBooks({ maxPages: 500, startAt: 1 })
