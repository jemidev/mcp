import type {
	TMcpBoard,
	TMcpChannel,
	TMcpDictionaryItem,
	TMcpDictionaryKind,
	TMcpDocument,
	TMcpDocumentMode,
	TMcpMember,
	TMcpMessage,
	TMcpProject,
	TMcpProjectDetail,
	TMcpTask,
	TMcpTaskSummary
} from './entities'

// Single source of truth for what the bridge can do. The server derives its tool surface from
// this map; the bridge derives its handler table. Adding an operation in one place breaks the
// other side's exhaustiveness check until it is implemented.

/**
 * Destructive operations carry the user's own words back to the bridge. The assistant cannot
 * invent one without having asked — that is the entire point, so the bridge only checks that
 * something is there, not what it says.
 */
type Confirmed<T> = T & { confirmation: string }

/** Assignment and tag edits: replace the whole set, or nudge it without reading it first. */
type SetEdit = {
	memberIds?: string[]
	addMemberIds?: string[]
	removeMemberIds?: string[]
	tagIds?: string[]
	addTagIds?: string[]
	removeTagIds?: string[]
}

type TaskFields = SetEdit & {
	title?: string
	document?: TMcpDocument
	dueDate?: string | null
	priorityId?: string | null
	difficultyId?: string | null
}

export type TMcpOperations = {
	'context.projects': { params: Record<string, never>; result: TMcpProject[] }
	'context.project': { params: { projectId: string }; result: TMcpProjectDetail }
	'context.channels': { params: { projectId: string }; result: TMcpChannel[] }
	'context.members': { params: { projectId: string }; result: TMcpMember[] }

	'board.list': { params: { channelId: string }; result: TMcpBoard[] }
	'board.create': { params: { channelId: string; title: string }; result: TMcpBoard }
	'board.rename': { params: { boardId: string; channelId: string; title: string }; result: TMcpBoard }
	'board.delete': { params: Confirmed<{ boardId: string }>; result: { id: string } }

	'channel.create': {
		params: {
			projectId: string
			title: string
			type: 'TEXT' | 'BOARDS'
			categoryId?: string
			encryptionMode?: 'NONE' | 'PROJECT' | 'CHANNEL'
		}
		result: TMcpChannel
	}
	'channel.rename': { params: { channelId: string; title: string }; result: TMcpChannel }
	'channel.delete': { params: Confirmed<{ channelId: string }>; result: { id: string } }

	'task.list': { params: { channelId: string; boardId?: string }; result: TMcpTaskSummary[] }
	'task.get': {
		params: { taskId: string; documentMode?: TMcpDocumentMode }
		result: TMcpTask
	}
	'task.create': {
		params: { channelId: string; boardId: string } & TaskFields & { title: string }
		result: TMcpTask
	}
	'task.create_many': {
		params: {
			channelId: string
			boardId: string
			tasks: Array<TaskFields & { title: string }>
		}
		result: TMcpTaskSummary[]
	}
	'task.update': { params: { taskId: string } & TaskFields; result: TMcpTask }
	'task.move': { params: { taskId: string; boardId: string }; result: TMcpTask }
	'task.reorder': { params: { boardId: string; taskIds: string[] }; result: TMcpTaskSummary[] }
	'task.move_channel': {
		params: {
			taskId: string
			channelId: string
			boardId: string
			priorityId?: string | null
			difficultyId?: string | null
			tagIds?: string[]
		}
		result: TMcpTask
	}
	'task.delete': { params: Confirmed<{ taskId: string }>; result: { id: string } }
	'task.delete_many': { params: Confirmed<{ taskIds: string[] }>; result: { ids: string[] } }

	'comment.list': { params: { taskId: string; limit?: number }; result: TMcpMessage[] }
	'comment.add': { params: { taskId: string; content: string }; result: TMcpMessage }

	'chat.messages': { params: { channelId: string; limit?: number }; result: TMcpMessage[] }
	'chat.send': { params: { channelId: string; content: string }; result: TMcpMessage }

	'dictionary.list': {
		params: { kind: TMcpDictionaryKind; channelId: string }
		result: TMcpDictionaryItem[]
	}
	'dictionary.create': {
		params: {
			kind: TMcpDictionaryKind
			channelId: string
			title: string
			hex: string
			description?: string
		}
		result: TMcpDictionaryItem
	}
	'dictionary.update': {
		params: {
			kind: TMcpDictionaryKind
			channelId: string
			id: string
			title: string
			hex: string
			description?: string
		}
		result: TMcpDictionaryItem
	}
	'dictionary.delete': {
		params: Confirmed<{ kind: TMcpDictionaryKind; channelId: string; id: string }>
		result: { id: string }
	}
	'dictionary.reorder': {
		params: { kind: 'priority' | 'difficulty'; channelId: string; ids: string[] }
		result: TMcpDictionaryItem[]
	}
}

export type TMcpOperationName = keyof TMcpOperations

export type TMcpParams<K extends TMcpOperationName> = TMcpOperations[K]['params']
export type TMcpResult<K extends TMcpOperationName> = TMcpOperations[K]['result']
