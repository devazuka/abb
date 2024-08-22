import { getDocument } from './meli.js'
import { queueGR } from './goodreads.js'
import { queueAA } from './annasarchive.js'

export const proxyImage = async id => {
  let book = await getDocument(id)
	await Promise.all([
  	queueAA.push(book),
  	queueGR.push(book),
	])
  book = await getDocument(id)
  const res = await fetch(book.image, { redirect: 'follow' })
  if (res.ok) return res
  throw Error('not implemented')
}
