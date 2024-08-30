import { queueGR } from './goodreads.js'
import { waitForAllBookUpdates, updateBook, documentExists } from './meili.js'
import { queueAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'

// Because AA as a strict rate limiting we run those query with a delay
let SYNC_PENDING = Promise.resolve()
export const waitUntilNoSyncPending = () => SYNC_PENDING
export const syncBooks = (args) => {
  const result = SYNC_PENDING.then(() => _syncBooks(args))
  SYNC_PENDING = result.catch(() => {})
  return result
}

const preFetchSize = [...Array(5).keys()]
const _syncBooks = async ({ maxPages = 3, startAt = 1, step = 1 } = {}) => {
  let i = startAt
  let total = 0
  let scanned = 0
  let emptyPages = 0
  const preFetchedPages = {}
  while (i > 0 && i <= 500) {
    let newBooks
    for (const n of preFetchSize) {
      const page = n + i
      if (preFetchedPages[page]) continue
      preFetchedPages[page] = getABBPageResults(page)
    }
    while (true) {
      try {
        newBooks = []
        const bs = await preFetchedPages[i]
        scanned += bs.length
        for (const b of bs) {
          let book = await documentExists(b.key)
          if (!book?.name) {
            book = await getABB(b.key)
            updateBook(book)
            newBooks.push(book)
          }
          book.gr_updatedAt || queueGR.enqueue(book)
          book.aa_updatedAt || queueAA.enqueue(book)
        }
        break
      } catch (err) {
        console.log('unexpected error in main loop:', err)
        console.log('retry...')
      }
    }
    emptyPages += !newBooks.length
    if (emptyPages > maxPages) break
    total += newBooks.length
    i += step
  }
  await waitForAllBookUpdates()
  console.log(`total books added: ${total}/${scanned}`, total)
  setTimeout(syncBooks, 10*60*1000)
}
