import type { TMcpOperationName, TMcpParams } from '../protocol'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { documentFormatGuide } from '../protocol'

import { McpBridgeError, type BridgeHub } from './bridge'

type ToolResult = {
	content: { type: 'text'; text: string }[]
	isError?: boolean
}

const dictionaryKind = z
	.enum(['tag', 'priority', 'difficulty'])
	.describe('Which per-channel dictionary to operate on')

const channelId = z.string().describe('Channel id, from jemi_list_channels')

const confirmation = z
	.string()
	.min(1)
	.describe(
		'What the user said when you asked them to confirm this deletion. Ask first and quote them — do not fill this in yourself.'
	)

const document = z
	.string()
	.describe(
		'Markdown. CommonMark + GFM, plus Jemi syntax for what markdown lacks: ++underline++, @memberId mentions, <red>coloured</red> or <#b53636>coloured</#b53636>. Emoji are written as the character itself (🚀), never as a :shortcode:. Call jemi_document_format once for the full list.'
	)

const messageBody = {
	content: document.describe(
		'The message, as markdown — **bold**, lists, quotes, @memberId mentions and emoji written as the character itself (🚀, never a :shortcode:) all work. Comments and chat take a narrower set than task bodies: no horizontal rules, no colour.'
	)
}

/** Fields shared by task create and update. */
const taskFields = {
	document: document.optional(),
	dueDate: z.string().nullish().describe('ISO 8601 date, or null to clear'),
	priorityId: z.string().nullish(),
	difficultyId: z.string().nullish(),
	memberIds: z.array(z.string()).optional().describe('Replaces the whole assignee list'),
	addMemberIds: z.array(z.string()).optional().describe('Assign, keeping existing assignees'),
	removeMemberIds: z.array(z.string()).optional(),
	tagIds: z.array(z.string()).optional().describe('Replaces the whole tag list'),
	addTagIds: z.array(z.string()).optional(),
	removeTagIds: z.array(z.string()).optional()
}

function ok(value: unknown): ToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function fail(error: unknown): ToolResult {
	const detail =
		error instanceof McpBridgeError
			? `${error.detail.code}: ${error.detail.message}`
			: error instanceof Error
				? error.message
				: String(error)
	return { content: [{ type: 'text', text: detail }], isError: true }
}

export function registerTools(server: McpServer, hub: BridgeHub): void {
	const run = async <K extends TMcpOperationName>(
		op: K,
		params: TMcpParams<K>
	): Promise<ToolResult> => {
		try {
			return ok(await hub.call(op, params))
		} catch (error) {
			return fail(error)
		}
	}

	// ---------------------------------------------------------------- context

	server.registerTool(
		'jemi_list_projects',
		{
			title: 'List projects',
			description: 'List Jemi projects the connected user can access.',
			inputSchema: {}
		},
		() => run('context.projects', {})
	)

	server.registerTool(
		'jemi_get_project',
		{
			title: 'Get project',
			description: 'Project details: owner, member and channel counts, encryption mode.',
			inputSchema: { projectId: z.string() }
		},
		({ projectId }) => run('context.project', { projectId })
	)

	server.registerTool(
		'jemi_list_channels',
		{
			title: 'List channels',
			description:
				'List channels in a project. BOARDS channels hold tasks, TEXT channels hold chat.',
			inputSchema: { projectId: z.string() }
		},
		({ projectId }) => run('context.channels', { projectId })
	)

	server.registerTool(
		'jemi_list_members',
		{
			title: 'List members',
			description: 'List project members. Use their ids when assigning tasks.',
			inputSchema: { projectId: z.string() }
		},
		({ projectId }) => run('context.members', { projectId })
	)

	server.registerTool(
		'jemi_create_channel',
		{
			title: 'Create channel',
			description:
				'Create a channel. Encryption defaults to the project setting; CHANNEL mode gives it a separate key.',
			inputSchema: {
				projectId: z.string(),
				title: z.string().min(1),
				type: z.enum(['TEXT', 'BOARDS']),
				categoryId: z.string().optional(),
				encryptionMode: z.enum(['NONE', 'PROJECT', 'CHANNEL']).optional()
			}
		},
		(params) => run('channel.create', params)
	)

	server.registerTool(
		'jemi_rename_channel',
		{
			title: 'Rename channel',
			inputSchema: { channelId, title: z.string().min(1) }
		},
		({ channelId, title }) => run('channel.rename', { channelId, title })
	)

	server.registerTool(
		'jemi_delete_channel',
		{
			title: 'Delete channel',
			description:
				'Deletes the channel and everything in it — tasks, boards, messages. Ask the user first.',
			inputSchema: { channelId, confirmation }
		},
		({ channelId, confirmation }) => run('channel.delete', { channelId, confirmation })
	)

	// ----------------------------------------------------------------- boards

	server.registerTool(
		'jemi_list_boards',
		{
			title: 'List boards',
			description: 'List boards (columns) of a BOARDS channel, in display order.',
			inputSchema: { channelId }
		},
		({ channelId }) => run('board.list', { channelId })
	)

	server.registerTool(
		'jemi_create_board',
		{
			title: 'Create board',
			inputSchema: { channelId, title: z.string().min(1) }
		},
		({ channelId, title }) => run('board.create', { channelId, title })
	)

	server.registerTool(
		'jemi_rename_board',
		{
			title: 'Rename board',
			inputSchema: { boardId: z.string(), channelId, title: z.string().min(1) }
		},
		({ boardId, channelId, title }) => run('board.rename', { boardId, channelId, title })
	)

	server.registerTool(
		'jemi_delete_board',
		{
			title: 'Delete board',
			description: 'Deletes the board and every task on it. Ask the user first.',
			inputSchema: { boardId: z.string(), confirmation }
		},
		({ boardId, confirmation }) => run('board.delete', { boardId, confirmation })
	)

	// ------------------------------------------------------------------ tasks

	server.registerTool(
		'jemi_list_tasks',
		{
			title: 'List tasks',
			description:
				'List or search tasks. Give channelId for one channel, or projectId to search every board channel of a project. Filter instead of reading everything: a busy channel holds hundreds of tasks. Returns { total, tasks } — if total exceeds the number returned, narrow the filter or page with offset.',
			inputSchema: {
				channelId: channelId.optional(),
				projectId: z.string().optional().describe('Search across the whole project instead'),
				boardId: z.string().optional(),
				search: z.string().optional().describe('Case-insensitive substring of the title'),
				tagIds: z.array(z.string()).optional().describe('Keep tasks carrying any of these tags'),
				priorityIds: z.array(z.string()).optional(),
				difficultyIds: z.array(z.string()).optional(),
				memberIds: z.array(z.string()).optional().describe('Keep tasks assigned to any of these'),
				missing: z
					.array(z.enum(['priority', 'difficulty', 'dueDate', 'tags', 'members']))
					.optional()
					.describe('Keep only tasks where these are unset, e.g. ["priority"]'),
				detail: z
					.enum(['brief', 'full'])
					.optional()
					.describe('brief (default) omits tags, assignees, priority and difficulty'),
				limit: z.number().int().min(1).max(500).optional(),
				offset: z.number().int().min(0).optional()
			}
		},
		(params) => run('task.list', params)
	)

	server.registerTool(
		'jemi_get_task',
		{
			title: 'Get task',
			description:
				'Full task including its body. The body comes back as markdown by default.',
			inputSchema: { taskId: z.string() }
		},
		({ taskId }) => run('task.get', { taskId })
	)

	server.registerTool(
		'jemi_find_task_by_key',
		{
			title: 'Find task by its number',
			description:
				'Look a task up by the number the user sees in the UI, like "ALP-0254". Use this whenever they name a task that way — do not list a whole channel to search for it.',
			inputSchema: {
				key: z.string().describe('Task number as shown in Jemi, e.g. ALP-0254'),
				projectId: z.string().optional().describe('Narrows the search; otherwise every project is checked')
			}
		},
		(params) => run('task.by_key', params)
	)

	server.registerTool(
		'jemi_create_task',
		{
			title: 'Create task',
			description:
				'Create a task on a board. Priority, difficulty and tag ids must come from jemi_list_dictionary for the same channel.',
			inputSchema: { channelId, boardId: z.string(), title: z.string().min(1), ...taskFields }
		},
		(params) => run('task.create', params)
	)

	server.registerTool(
		'jemi_create_tasks',
		{
			title: 'Create several tasks',
			description: 'Create many tasks on one board in a single call.',
			inputSchema: {
				channelId,
				boardId: z.string(),
				tasks: z.array(z.object({ title: z.string().min(1), ...taskFields })).min(1)
			}
		},
		({ channelId, boardId, tasks }) => run('task.create_many', { channelId, boardId, tasks })
	)

	server.registerTool(
		'jemi_update_task',
		{
			title: 'Update task',
			description:
				'Update task fields. Omitted fields are left untouched. Setting the document replaces the whole body.',
			inputSchema: { taskId: z.string(), title: z.string().min(1).optional(), ...taskFields }
		},
		(params) => run('task.update', params)
	)

	server.registerTool(
		'jemi_update_tasks',
		{
			title: 'Update several tasks',
			description:
				'Update many tasks in one call, each with its own fields. Use this instead of a run of jemi_update_task — setting a priority on twenty tasks is one call, not twenty.',
			inputSchema: {
				updates: z
					.array(z.object({ taskId: z.string(), title: z.string().min(1).optional(), ...taskFields }))
					.min(1)
			}
		},
		({ updates }) => run('task.update_many', { updates })
	)

	server.registerTool(
		'jemi_move_task',
		{
			title: 'Move task to another board',
			description: 'Move a task to another board within the same channel.',
			inputSchema: { taskId: z.string(), boardId: z.string() }
		},
		({ taskId, boardId }) => run('task.move', { taskId, boardId })
	)

	server.registerTool(
		'jemi_reorder_tasks',
		{
			title: 'Reorder tasks on a board',
			description: 'Set the order of tasks within one board.',
			inputSchema: {
				boardId: z.string(),
				taskIds: z.array(z.string()).describe('All task ids of that board, in the desired order')
			}
		},
		({ boardId, taskIds }) => run('task.reorder', { boardId, taskIds })
	)

	server.registerTool(
		'jemi_move_task_to_channel',
		{
			title: 'Move task to another channel',
			description:
				'Move a task across channels. Its title and body are re-encrypted with the target key, and tags, priority and difficulty are dropped unless you supply ids from the target channel.',
			inputSchema: {
				taskId: z.string(),
				channelId: channelId.describe('Target channel id'),
				boardId: z.string().describe('Target board id, from jemi_list_boards on that channel'),
				priorityId: z.string().nullish(),
				difficultyId: z.string().nullish(),
				tagIds: z.array(z.string()).optional()
			}
		},
		(params) => run('task.move_channel', params)
	)

	server.registerTool(
		'jemi_delete_task',
		{
			title: 'Delete task',
			description: 'Deletes a task permanently. Ask the user first.',
			inputSchema: { taskId: z.string(), confirmation }
		},
		({ taskId, confirmation }) => run('task.delete', { taskId, confirmation })
	)

	server.registerTool(
		'jemi_delete_tasks',
		{
			title: 'Delete several tasks',
			description: 'Deletes tasks permanently. Ask the user first and list what will go.',
			inputSchema: { taskIds: z.array(z.string()).min(1), confirmation }
		},
		({ taskIds, confirmation }) => run('task.delete_many', { taskIds, confirmation })
	)

	// --------------------------------------------------------------- comments

	server.registerTool(
		'jemi_read_task_comments',
		{
			title: 'Read task comments',
			description:
				'Read the comment thread of a task, oldest first. Comments are separate from the task body.',
			inputSchema: { taskId: z.string(), limit: z.number().int().min(1).max(200).optional() }
		},
		({ taskId, limit }) => run('comment.list', { taskId, limit })
	)

	server.registerTool(
		'jemi_add_task_comment',
		{
			title: 'Comment on a task',
			description:
				'Post a comment on a task as the connected user. Use this to say something about a task — editing the task body would overwrite its description. Pass "content" for plain text or "document" for formatting.',
			inputSchema: { taskId: z.string(), ...messageBody }
		},
		({ taskId, content }) => run('comment.add', { taskId, content })
	)

	// ------------------------------------------------------------------- chat

	server.registerTool(
		'jemi_read_messages',
		{
			title: 'Read messages',
			description: 'Read the most recent messages of a channel, oldest first.',
			inputSchema: { channelId, limit: z.number().int().min(1).max(200).optional() }
		},
		({ channelId, limit }) => run('chat.messages', { channelId, limit })
	)

	server.registerTool(
		'jemi_send_message',
		{
			title: 'Send message',
			description:
				'Post a message to a channel as the connected user. Pass "content" for plain text or "document" for formatting.',
			inputSchema: { channelId, ...messageBody }
		},
		({ channelId, content }) => run('chat.send', { channelId, content })
	)

	server.registerTool(
		'jemi_document_format',
		{
			title: 'Rich text format reference',
			description:
				'The node and mark names accepted in a "tiptap" document. Read this once before writing formatted text — writing markdown into a plain-text field produces literal asterisks.',
			inputSchema: {
				surface: z
					.enum(['task', 'comment', 'message'])
					.optional()
					.describe('Which surface the document is for. Task bodies accept a few extra nodes.')
			}
		},
		({ surface }) => ({ content: [{ type: 'text' as const, text: documentFormatGuide(surface) }] })
	)

	// ------------------------------------------------------------ dictionaries

	server.registerTool(
		'jemi_list_dictionary',
		{
			title: 'List tags / priorities / difficulties',
			description: 'List a channel dictionary. These are per-channel, not per-project.',
			inputSchema: { kind: dictionaryKind, channelId }
		},
		({ kind, channelId }) => run('dictionary.list', { kind, channelId })
	)

	server.registerTool(
		'jemi_create_dictionary_item',
		{
			title: 'Create tag / priority / difficulty',
			inputSchema: {
				kind: dictionaryKind,
				channelId,
				title: z.string().min(1),
				hex: z.string().describe('Colour as #rrggbb'),
				description: z.string().optional()
			}
		},
		(params) => run('dictionary.create', params)
	)

	server.registerTool(
		'jemi_update_dictionary_item',
		{
			title: 'Update tag / priority / difficulty',
			inputSchema: {
				kind: dictionaryKind,
				channelId,
				id: z.string(),
				title: z.string().min(1),
				hex: z.string().describe('Colour as #rrggbb'),
				description: z.string().optional()
			}
		},
		(params) => run('dictionary.update', params)
	)

	server.registerTool(
		'jemi_update_dictionary_items',
		{
			title: 'Update several tags / priorities / difficulties',
			description: 'Rewrite many dictionary entries of one channel in a single call.',
			inputSchema: {
				kind: dictionaryKind,
				channelId,
				items: z
					.array(
						z.object({
							id: z.string(),
							title: z.string().min(1),
							hex: z.string().describe('Colour as #rrggbb'),
							description: z.string().optional()
						})
					)
					.min(1)
			}
		},
		(params) => run('dictionary.update_many', params)
	)

	server.registerTool(
		'jemi_delete_dictionary_item',
		{
			title: 'Delete tag / priority / difficulty',
			description: 'Detaches the item from every task that used it. Ask the user first.',
			inputSchema: { kind: dictionaryKind, channelId: z.string(), id: z.string(), confirmation }
		},
		({ kind, channelId, id, confirmation }) =>
			run('dictionary.delete', { kind, channelId, id, confirmation })
	)

	server.registerTool(
		'jemi_reorder_dictionary',
		{
			title: 'Reorder priorities / difficulties',
			description: 'Set display order. Tags are unordered and not accepted here.',
			inputSchema: {
				kind: z.enum(['priority', 'difficulty']),
				channelId,
				ids: z.array(z.string()).describe('All item ids in the desired order')
			}
		},
		({ kind, channelId, ids }) => run('dictionary.reorder', { kind, channelId, ids })
	)
}
