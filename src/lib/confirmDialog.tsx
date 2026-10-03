import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import ConfirmationDialog from '../components/ConfirmationDialog'

type ConfirmationRequest = {
  message: string
  resolve: (confirmed: boolean) => void
}

const requests: ConfirmationRequest[] = []
let active = false

function showNextConfirmation() {
  if (active || !requests.length) return
  active = true
  const request = requests.shift()!
  const previousFocus = document.activeElement
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let settled = false
  const finish = (confirmed: boolean) => {
    if (settled) return
    settled = true
    queueMicrotask(() => {
      root.unmount()
      host.remove()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
      active = false
      showNextConfirmation()
      request.resolve(confirmed)
    })
  }
  // A camada modal deve bloquear novos cliques antes de retornar ao chamador.
  flushSync(() => root.render(<ConfirmationDialog message={request.message} onResult={finish} />))
}

export function confirmAction(message: string): Promise<boolean> {
  if (typeof document === 'undefined') throw new Error('A confirmação precisa ser aberta no navegador.')
  return new Promise((resolve) => {
    requests.push({ message, resolve })
    showNextConfirmation()
  })
}
