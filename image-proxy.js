import { getDocument } from './meili.js'

export const proxyImage = async id => {
  const book = await getDocument(id)
  const res = await fetch(book.image, { redirect: 'follow' })
  if (res.ok) return res
  throw Error('not implemented')
}
