import { chooseAction } from './ai'
import type { AIRequest, AIResponse } from './ai/protocol'

self.onmessage = (event: MessageEvent<AIRequest>) => {
  try {
    const { view, difficulty, profile } = event.data
    self.postMessage({ action: chooseAction(view, undefined, { difficulty, profile }) } satisfies AIResponse)
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : 'Не удалось рассчитать решение ИИ.' } satisfies AIResponse)
  }
}
