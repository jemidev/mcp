// DTOs the bridge returns to the MCP server. Every text field is already decrypted in the
// browser — the server deals in plain strings and never sees keys or JBCP envelopes.

export type TMcpProject = {
	id: string
	title: string
	encryptionMode: 'NONE' | 'PROJECT' | 'CHANNEL'
}

export type TMcpProjectDetail = TMcpProject & {
	createdAt: string
	memberCount: number
	owner: TMcpMember | null
	channelCount: number
}

export type TMcpChannel = {
	id: string
	projectId: string
	title: string
	type: 'TEXT' | 'BOARDS' | 'VOICE' | 'MEETING'
	identifier: string | null
	categoryTitle: string | null
}

export type TMcpMember = {
	id: string
	userId: string
	displayName: string
	online: boolean
}

export type TMcpBoard = {
	id: string
	channelId: string
	title: string
	position: number
	taskCount: number
}

/** Shared shape for tag / priority / difficulty — they are structurally identical. */
export type TMcpDictionaryItem = {
	id: string
	channelId: string
	title: string
	description: string | null
	hex: string
	position: number | null
}

export type TMcpDictionaryKind = 'tag' | 'priority' | 'difficulty'

/**
 * What a listing returns by default. Whole channels are listed at once, so everything that is
 * not needed to pick a task out of the list is left to `full` detail — a few hundred tasks with
 * their tags and assignees inlined will not fit in an assistant's context.
 */
export type TMcpTaskBrief = {
	id: string
	/** Human-facing number, the one shown in the UI: `ALP-0254`. Null when the channel has none. */
	key: string | null
	/** The number behind `key`, unique within the channel. */
	identifier: number
	title: string
	boardId: string
	channelId: string
	position: number
}

export type TMcpTaskSummary = TMcpTaskBrief & {
	progress: number | null
	dueDate: string | null
	priority: TMcpDictionaryItem | null
	difficulty: TMcpDictionaryItem | null
	tags: TMcpDictionaryItem[]
	members: TMcpMember[]
}

/**
 * Rich text, in one currency in both directions: markdown. Everything Jemi stores has a
 * markdown spelling — including what CommonMark has no syntax for, which gets Jemi's own
 * (underline, emoji, mentions, colour, attachments) — so a body survives being read, edited
 * and written back without losing anything it started with.
 */
export type TMcpDocument = string

export type TMcpTask = TMcpTaskSummary & {
	/** Markdown. See the `jemi_document_format` tool for the Jemi-specific syntax. */
	document: TMcpDocument
	createdAt: string
	updatedAt: string
}

export type TMcpMessage = {
	id: number
	channelId: string
	authorId: string
	authorName: string
	/** Markdown, the same dialect `content` accepts when posting. */
	content: string
	createdAt: string
	updatedAt: string
}
