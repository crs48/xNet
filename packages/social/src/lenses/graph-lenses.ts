/**
 * Starter graph lenses over the canonical social graph.
 */

import type {
  QueryASTRelationInclude,
  QueryASTQuerySet,
  SavedViewDescriptor,
  SchemaIRI
} from '@xnetjs/data'
import {
  defineNodeQueryAST,
  defineQuerySetAST,
  defineSavedViewDescriptor,
  queryOperators,
  validateSavedViewDescriptor
} from '@xnetjs/data'
import {
  SocialActorSchema,
  SocialCollectionItemSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialInteractionSchema,
  SocialMessageSchema
} from '../schemas'

export type SocialGraphLensId =
  | 'social.lens.people-i-follow'
  | 'social.lens.saved-content-by-creator'
  | 'social.lens.conversation-references'
  | 'social.lens.ai-citations'

export type SocialGraphLensNodeRole =
  | 'actor'
  | 'content'
  | 'interaction'
  | 'conversation'
  | 'message'
  | 'collection'
  | 'collection-item'

export type SocialGraphLensRelationshipKind =
  | 'follows'
  | 'saved'
  | 'authored'
  | 'participated'
  | 'referenced'
  | 'cited'
  | 'contains'

export type SocialGraphLensQueryRole = {
  role: SocialGraphLensNodeRole
  schemaId: string
}

export type SocialGraphLensEdgeRule = {
  sourceQuery: string
  sourceField?: string
  targetQuery: string
  targetField?: string
  relationshipKind: SocialGraphLensRelationshipKind
  label: string
}

export type SocialGraphLensDefinition = {
  id: SocialGraphLensId
  title: string
  description: string
  primaryQueryId: string
  descriptor: SavedViewDescriptor & { query: QueryASTQuerySet }
  queryRoles: Record<string, SocialGraphLensQueryRole>
  edgeRules: SocialGraphLensEdgeRule[]
}

export type SocialGraphLensOptions = {
  pageSize?: number
  scope?: SavedViewDescriptor['scope']
}

const DEFAULT_LENS_PAGE_SIZE = 250

function page(options: SocialGraphLensOptions) {
  return { first: options.pageSize ?? DEFAULT_LENS_PAGE_SIZE, count: 'estimate' as const }
}

function relationInclude(input: {
  field: string
  targetSchemaId: SchemaIRI
  cardinality?: 'one' | 'many'
  required?: boolean
}): QueryASTRelationInclude {
  return {
    kind: 'relation-include',
    direction: 'outbound',
    field: input.field,
    targetSchemaId: input.targetSchemaId,
    query: defineNodeQueryAST(input.targetSchemaId),
    cardinality: input.cardinality ?? 'one',
    ...(input.required ? { required: true } : {})
  }
}

function defineSocialGraphLens(input: {
  id: SocialGraphLensId
  title: string
  description: string
  primaryQueryId: string
  query: QueryASTQuerySet
  queryRoles: Record<string, SocialGraphLensQueryRole>
  edgeRules: SocialGraphLensEdgeRule[]
  scope?: SavedViewDescriptor['scope']
}): SocialGraphLensDefinition {
  const descriptor = defineSavedViewDescriptor({
    title: input.title,
    description: input.description,
    scope: input.scope ?? 'workspace',
    query: input.query
  }) as SavedViewDescriptor & { query: QueryASTQuerySet }
  const validation = validateSavedViewDescriptor(descriptor)

  if (!validation.valid) {
    throw new Error(`Invalid social graph lens descriptor: ${input.id}`)
  }

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    primaryQueryId: input.primaryQueryId,
    descriptor,
    queryRoles: input.queryRoles,
    edgeRules: input.edgeRules
  }
}

function peopleIFollowLens(options: SocialGraphLensOptions): SocialGraphLensDefinition {
  const interaction = queryOperators<(typeof SocialInteractionSchema)['_properties']>()
  const queries = {
    follows: defineNodeQueryAST(SocialInteractionSchema, {
      where: interaction.eq('interactionKind', 'follow'),
      include: {
        actor: relationInclude({ field: 'actor', targetSchemaId: SocialActorSchema._schemaId }),
        target: relationInclude({ field: 'target', targetSchemaId: SocialActorSchema._schemaId })
      },
      orderBy: { observedAt: 'desc', publishedAt: 'desc' },
      page: page(options)
    }),
    people: defineNodeQueryAST(SocialActorSchema, {
      orderBy: { displayName: 'asc', handle: 'asc' },
      page: page(options)
    })
  }

  return defineSocialGraphLens({
    id: 'social.lens.people-i-follow',
    title: 'People I Follow',
    description: 'Follow interactions connected to the followed actors and observing accounts.',
    primaryQueryId: 'follows',
    scope: options.scope,
    query: defineQuerySetAST(queries, { mode: 'dashboard' }),
    queryRoles: {
      follows: { role: 'interaction', schemaId: SocialInteractionSchema._schemaId },
      people: { role: 'actor', schemaId: SocialActorSchema._schemaId }
    },
    edgeRules: [
      {
        sourceQuery: 'follows',
        sourceField: 'actor',
        targetQuery: 'people',
        targetField: 'target',
        relationshipKind: 'follows',
        label: 'follows'
      }
    ]
  })
}

function savedContentByCreatorLens(options: SocialGraphLensOptions): SocialGraphLensDefinition {
  const interaction = queryOperators<(typeof SocialInteractionSchema)['_properties']>()
  const content = queryOperators<(typeof SocialContentSchema)['_properties']>()
  const queries = {
    saves: defineNodeQueryAST(SocialInteractionSchema, {
      where: interaction.eq('interactionKind', 'save'),
      include: {
        actor: relationInclude({ field: 'actor', targetSchemaId: SocialActorSchema._schemaId }),
        target: relationInclude({ field: 'target', targetSchemaId: SocialContentSchema._schemaId })
      },
      orderBy: { observedAt: 'desc', importedAt: 'desc' },
      page: page(options)
    }),
    content: defineNodeQueryAST(SocialContentSchema, {
      where: content.isNotNull('authorActor'),
      include: {
        author: relationInclude({
          field: 'authorActor',
          targetSchemaId: SocialActorSchema._schemaId
        })
      },
      orderBy: { publishedAt: 'desc', observedAt: 'desc' },
      page: page(options)
    })
  }

  return defineSocialGraphLens({
    id: 'social.lens.saved-content-by-creator',
    title: 'Saved Content By Creator',
    description: 'Saved posts, reels, and links grouped around their creator actors.',
    primaryQueryId: 'saves',
    scope: options.scope,
    query: defineQuerySetAST(queries, { mode: 'dashboard' }),
    queryRoles: {
      saves: { role: 'interaction', schemaId: SocialInteractionSchema._schemaId },
      content: { role: 'content', schemaId: SocialContentSchema._schemaId }
    },
    edgeRules: [
      {
        sourceQuery: 'saves',
        sourceField: 'actor',
        targetQuery: 'content',
        targetField: 'target',
        relationshipKind: 'saved',
        label: 'saved'
      },
      {
        sourceQuery: 'content',
        sourceField: 'authorActor',
        targetQuery: 'content',
        relationshipKind: 'authored',
        label: 'authored'
      }
    ]
  })
}

function conversationReferencesLens(options: SocialGraphLensOptions): SocialGraphLensDefinition {
  const message = queryOperators<(typeof SocialMessageSchema)['_properties']>()
  const queries = {
    conversations: defineNodeQueryAST(SocialConversationSchema, {
      orderBy: { lastMessageAt: 'desc', startedAt: 'desc' },
      page: page(options)
    }),
    messages: defineNodeQueryAST(SocialMessageSchema, {
      where: message.isNotNull('externalRefsJson'),
      include: {
        conversation: relationInclude({
          field: 'conversation',
          targetSchemaId: SocialConversationSchema._schemaId
        }),
        sender: relationInclude({
          field: 'senderActor',
          targetSchemaId: SocialActorSchema._schemaId
        })
      },
      orderBy: { sentAt: 'desc', importedAt: 'desc' },
      page: page(options)
    })
  }

  return defineSocialGraphLens({
    id: 'social.lens.conversation-references',
    title: 'Conversation References',
    description: 'Messages that carry external references connected back to their conversations.',
    primaryQueryId: 'messages',
    scope: options.scope,
    query: defineQuerySetAST(queries, { mode: 'dashboard' }),
    queryRoles: {
      conversations: { role: 'conversation', schemaId: SocialConversationSchema._schemaId },
      messages: { role: 'message', schemaId: SocialMessageSchema._schemaId }
    },
    edgeRules: [
      {
        sourceQuery: 'messages',
        sourceField: 'conversation',
        targetQuery: 'conversations',
        relationshipKind: 'referenced',
        label: 'in conversation'
      }
    ]
  })
}

function aiCitationsLens(options: SocialGraphLensOptions): SocialGraphLensDefinition {
  const interaction = queryOperators<(typeof SocialInteractionSchema)['_properties']>()
  const message = queryOperators<(typeof SocialMessageSchema)['_properties']>()
  const queries = {
    citations: defineNodeQueryAST(SocialInteractionSchema, {
      where: interaction.eq('interactionKind', 'cited'),
      include: {
        actor: relationInclude({ field: 'actor', targetSchemaId: SocialActorSchema._schemaId }),
        target: relationInclude({ field: 'target', targetSchemaId: SocialContentSchema._schemaId })
      },
      orderBy: { observedAt: 'desc', importedAt: 'desc' },
      page: page(options)
    }),
    aiMessages: defineNodeQueryAST(SocialMessageSchema, {
      where: message.eq('messageKind', 'ai-response'),
      include: {
        conversation: relationInclude({
          field: 'conversation',
          targetSchemaId: SocialConversationSchema._schemaId
        })
      },
      orderBy: { sentAt: 'desc', importedAt: 'desc' },
      page: page(options)
    }),
    projects: defineNodeQueryAST(SocialCollectionSchema, {
      page: page(options)
    }),
    projectItems: defineNodeQueryAST(SocialCollectionItemSchema, {
      page: page(options)
    })
  }

  return defineSocialGraphLens({
    id: 'social.lens.ai-citations',
    title: 'AI Citations',
    description: 'AI responses, citation interactions, cited content, and related projects.',
    primaryQueryId: 'citations',
    scope: options.scope,
    query: defineQuerySetAST(queries, { mode: 'dashboard' }),
    queryRoles: {
      citations: { role: 'interaction', schemaId: SocialInteractionSchema._schemaId },
      aiMessages: { role: 'message', schemaId: SocialMessageSchema._schemaId },
      projects: { role: 'collection', schemaId: SocialCollectionSchema._schemaId },
      projectItems: { role: 'collection-item', schemaId: SocialCollectionItemSchema._schemaId }
    },
    edgeRules: [
      {
        sourceQuery: 'citations',
        sourceField: 'actor',
        targetQuery: 'citations',
        targetField: 'target',
        relationshipKind: 'cited',
        label: 'cited'
      },
      {
        sourceQuery: 'projectItems',
        sourceField: 'collection',
        targetQuery: 'projects',
        relationshipKind: 'contains',
        label: 'contains'
      }
    ]
  })
}

/**
 * Create the built-in graph lenses the Electron UI can offer immediately.
 */
export function createDefaultSocialGraphLenses(
  options: SocialGraphLensOptions = {}
): SocialGraphLensDefinition[] {
  return [
    peopleIFollowLens(options),
    savedContentByCreatorLens(options),
    conversationReferencesLens(options),
    aiCitationsLens(options)
  ]
}
