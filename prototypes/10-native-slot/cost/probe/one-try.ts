import type {} from '../../lib/request-typing'
export async function main() {
  return await $betterFetch.try('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    query: { team: 't', page: 2 },
  })
}
