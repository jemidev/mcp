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

export type TMcpTaskSummary = {
	id: string
	title: string
	boardId: string
	channelId: string
	position: number
	progress: number | null
	dueDate: string | null
	priority: TMcpDictionaryItem | null
	difficulty: TMcpDictionaryItem | null
	tags: TMcpDictionaryItem[]
	members: TMcpMember[]
}

/**
 * Task bodies are rich text. `text` is the lossy but easy mode — headings, lists and marks
 * collapse to lines. `tiptap` carries the real ProseMirror document, which is what to use
 * when formatting matters; writing markdown into `text` produces literal asterisks, not bold.
 */
export type TMcpDocument =
	| { mode: 'text'; text: string }
	| { mode: 'tiptap'; json: Record<string, unknown> }

export type TMcpDocumentMode = TMcpDocument['mode']

export type TMcpTask = TMcpTaskSummary & {
	document: TMcpDocument
	createdAt: string
	updatedAt: string
}

export type TMcpMessage = {
	id: number
	channelId: string
	authorId: string
	authorName: string
	content: string
	createdAt: string
	updatedAt: string
}
