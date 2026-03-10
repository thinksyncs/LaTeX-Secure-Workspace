import type { ClientRequest, PanelRequest } from '../../types/latex-workshop-protocol-types/index'
import * as utils from './utils.js'

export function initConnect() {
    console.warn('Internal viewer connection is disabled in this build.')
}

export function send(message: ClientRequest) {
    void message
}

export function sendLog(message: string) {
    if (utils.isEmbedded()) {
        sendPanel({ type: 'log', message })
        return
    }
    console.warn(message)
}

export function sendPanel(msg: PanelRequest) {
    if (!utils.isEmbedded()) {
        return
    }
    window.parent?.postMessage(msg, '*')
}
