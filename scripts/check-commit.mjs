import { readFileSync } from 'node:fs'
const message = readFileSync(process.argv[2], 'utf8')
if (
  !/^(feat|fix|perf|refactor|docs|style|test|build|ci|chore|revert)(\([^)]+\))?!?: .+/u.test(
    message.split('\n')[0]
  )
) {
  throw new Error('Use a Conventional Commit title, followed by descriptive bullets.')
}
