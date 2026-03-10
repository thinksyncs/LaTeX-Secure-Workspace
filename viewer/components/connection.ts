import type { ClientRequest, PanelRequest } from '../../types/latex-workshop-protocol-types/index'
import * as utils from './utils.js'

type VsCodeApi = {
    postMessage: (msg: PanelRequest) => void
}

type ViewerGlobal = typeof globalThis & {
    acquireVsCodeApi?: () => VsCodeApi
}

export function initConnect() {
    console.warn('Internal viewer connection is disabled in this build.')
}

export function send(message: ClientRequest) {
    void message
}

export function sendLog(message: string) {
    sendPanel({ type: 'log', message })
    console.warn(message)
}

export function sendPanel(msg: PanelRequest) {
    if (utils.isEmbedded()) {
        window.parent?.postMessage(msg, '*')
        return
    }
    const vscodeApi = (globalThis as ViewerGlobal).acquireVsCodeApi?.()
    if (vscodeApi) {
        vscodeApi.postMessage(msg)
    }
}
