import * as realFs from 'node:fs/promises'
import { mockState } from './state.mjs'

export const fsStubs = {
  ...realFs,
  readFile: async (filePath, encoding) => {
    const files = mockState().fs.files
    if (Object.prototype.hasOwnProperty.call(files, filePath)) {
      return files[filePath]
    }
    return realFs.readFile(filePath, encoding)
  },
  writeFile: async (filePath, content) => {
    mockState().fs.writes.push({ filePath, content })
  }
}
