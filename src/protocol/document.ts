// Task bodies, comments and chat messages are all markdown. CommonMark covers most of what Jemi
// stores; the rest gets a Jemi spelling, so that a body can be read, edited and written back
// without losing whatever it held before.

export type TMcpDocumentSurface = 'task' | 'comment' | 'message'

const COMMON = `CommonMark + GFM:

  # heading            (levels 1-6)
  **bold**  *italic*  ~~strike~~  \`code\`
  [link](https://...)
  - bullet             1. numbered
  - [ ] task           - [x] done
  > quote
  \`\`\`js
  code
  \`\`\`

Jemi additions:

  ++underline++
  🚀                                   emoji: type the character itself, any unicode one works.
                                       Do not invent :shortcodes: — you do not know the list.
  @memberId                            mentions a member, by id from jemi_list_members
  #channelId                           links a channel, by id from jemi_list_channels
  @everyone  @here                     the two special mentions, written as-is

Mentions carry ids, not names: display names and channel titles are not unique, so a name
would be ambiguous. Resolve the id first, and keep any mention you find in an existing body
exactly as it is.

Bold, italic, underline and strike combine freely. Inline code does not — it is exclusive, so
backticks around **text** keep the asterisks literal instead of making it bold.`

const TASK_ONLY = `
Task bodies also take:

  ---                                  horizontal rule
  <red>text</red>                      colour by name: brown slate zinc red orange amber
                                       yellow lime green emerald teal cyan sky blue indigo
                                       violet fuchsia pink rose
  <#b53636>text</#b53636>              colour by hex

Attachments already in the body appear as id references:

  ![favicon.png](jemi:image/ym1fr33qe1iijqeejtorveao)
  same for jemi:video/, jemi:audio/, and [name](jemi:file/ID)

You cannot upload anything, so never invent one of these. Keep the ones you find exactly as
they are — deleting the line deletes the user's attachment from the task.`

const CHAT_ONLY = `
Comments and chat messages do NOT support horizontal rules or coloured text. Anything the
surface has no node for is dropped when the message is stored.`

/** The syntax reference for one surface. Chat runs a narrower schema than task bodies. */
export function documentFormatGuide(surface: TMcpDocumentSurface = 'task'): string {
	return `${COMMON}\n${surface === 'task' ? TASK_ONLY : CHAT_ONLY}\n`
}
