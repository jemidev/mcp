import type { TMcpOperationName, TMcpParams } from '../protocol'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

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
	.discriminatedUnion('mode', [
		z.object({
			mode: z.literal('text'),
			text: z.string().describe('Plain text. Newlines become paragraphs; markup is NOT parsed.')
		}),
		z.object({
			mode: z.literal('tiptap'),
			json: z
				.record(z.string(), z.unknown())
				.describe('A ProseMirror/TipTap document: { "type": "doc", "content": [...] }')
		})
	])
	.describe(
		'Task body. Use "text" for prose. Use "tiptap" whenever you need headings, lists, bold or links — writing markdown into "text" shows up as literal asterisks.'
	)

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
			description: 'List tasks in a channel, optionally narrowed to one board.',
			inputSchema: { channelId, boardId: z.string().optional() }
		},
		({ channelId, boardId }) => run('task.list', { channelId, boardId })
	)

	server.registerTool(
		'jemi_get_task',
		{
			title: 'Get task',
			description:
				'Full task including its body. Request documentMode "tiptap" if you intend to edit the body while preserving formatting.',
			inputSchema: { taskId: z.string(), documentMode: z.enum(['text', 'tiptap']).optional() }
		},
		({ taskId, documentMode }) => run('task.get', { taskId, documentMode })
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
				'Post a comment on a task as the connected user. Use this to say something about a task — editing the task body would overwrite its description.',
			inputSchema: { taskId: z.string(), content: z.string().min(1) }
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
			description: 'Post a message to a channel as the connected user.',
			inputSchema: { channelId, content: z.string().min(1) }
		},
		({ channelId, content }) => run('chat.send', { channelId, content })
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
