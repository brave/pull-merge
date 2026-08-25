import { mockState } from './state.mjs'

export function markdownToTxt (text) {
  const { transform } = mockState().markdown
  return transform ? transform(text) : text
}
