export async function main() {
  return await $fetch('/api/users', {
    method: 'post',
    body: { name: 'a', age: '30' },
    query: { team: 't', page: 2 },
  })
}
