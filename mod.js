import { loadGoodReadsData } from './goodreads.js'
import { showTaskResult, addDocuments, documentExists, meli } from './meli.js'
import { searchAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'
import { startServer } from './server.js'

// Because AA as a strict rate limiting we run those query with a delay
const queue = []
setInterval(async () => {
  const book = queue.pop()
  if (!book) return
  try {
    const aa = await searchAA(book.name)
    Object.assign(book, aa[0])
    await addDocuments([book])
  } catch (err) {
    console.log('fail to retrive AA info for book:', book, err)
    queue.push(book)
  }
}, 60*1000)

const syncBooks = async () => {
  let i = 0
  let total = 0
  let scanned = 0
  let emptyPages = 0
  const tasks = []
  while (++i < 500) {
    const newBooks = []
    const bs = await getABBPageResults(i)
    scanned += bs.length
    for (const b of bs) {
      if (await documentExists(b.key)) continue
      const book = await getABB(b.key)
      const current = await meli(
        `/indexes/audiobooks/documents/${book.id}`,
      ).catch(err => err)
      if (current.code !== 404) continue
      const gr = await loadGoodReadsData(book.name)
      Object.assign(book, gr[0])
      newBooks.push(book)
      queue.push(book)
    }
    emptyPages += !newBooks.length
    if (emptyPages > 2) break
    tasks.push(await addDocuments(newBooks))
    total += newBooks.length
  }
  console.log(`total books added: ${total}/${scanned}`, total)
  console.log(await Promise.all(tasks.map(r => showTaskResult(r.taskUid))))
}

setInterval(syncBooks, 1000 * 60 * 60)
syncBooks()
startServer()
