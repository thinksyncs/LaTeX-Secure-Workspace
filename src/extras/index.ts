import * as commands from './activity-bar'
import { checkCitations } from './checkcites'
import { clean } from './cleaner'
import { section } from './section'
import * as snippet from './snippet-view'
import { texroot } from './texroot'

export const extra = {
    checkCitations,
    clean,
    texroot,
    section,
    commands,
    snippet
}
