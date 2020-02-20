import { ObjectTypeDefinitionNode, DirectiveNode, FieldDefinitionNode, InputObjectTypeDefinitionNode } from 'graphql'
import { TransformerContext } from '../transformer-core'
import { getDirectiveArguments } from '../utils'
import {
  ModelTypeNames,
  makeInputValueDefinition,
  makeNonNullType,
  makeNamedType,
  makeField,
  ResolverTypeNames,
  makeConnectionField,
  makeObjectDefinition,
  graphqlName,
  toUpper,
  ResolverNames,
} from '../transformer-common'
import {
  makeCreateInputObject,
  makeUpdateInputObject,
  makeDeleteInputObject,
  makeModelSortDirectionEnumObject,
  makeSubscriptionField,
  makeModelConnectionType,
  makeScalarFilterInputs,
  makeEnumFilterInputObjects,
  makeModelXFilterInputObject,
  makeModelXConditionInputObject,
} from '../definitions'
import { ResourceFactory } from '../resources'
import { ModelServiceResolvers } from '.'

export const supportsConditions = (_ctx: TransformerContext) => true

export const INPUT_TYPE_NAME_DATA = 'data'
export const INPUT_TYPE_NAME_WHERE = 'where'

export interface CreateFunctionArgs {
  def: ObjectTypeDefinitionNode
  directive: DirectiveNode
  ctx: TransformerContext
  resources: ResourceFactory
  nonModelArray: ObjectTypeDefinitionNode[]
  resolvers: Partial<ModelServiceResolvers<any, any>>
}

export const createMutations = ({ def, directive, ctx, resources, nonModelArray, resolvers }: CreateFunctionArgs) => {
  const typeName = def.name.value

  const mutationFields: FieldDefinitionNode[] = []
  // Get any name overrides provided by the user. If an empty map it provided
  // then we do not generate those fields.
  const directiveArguments = getDirectiveArguments(directive)

  // Configure mutations based on *mutations* argument
  const shouldMakeCreate = resolvers.hasOwnProperty('create')
  const shouldMakeUpdate = resolvers.hasOwnProperty('update')
  const shouldMakeDelete = resolvers.hasOwnProperty('delete')

  // Figure out which mutations to make and if they have name overrides
  const createFieldName = directiveArguments.mutations?.create
    ? directiveArguments.mutations.create
    : ResolverNames.CreateResolver(typeName)
  const updateFieldName = directiveArguments.mutations?.update
    ? directiveArguments.mutations.update
    : ResolverNames.UpdateResolver(typeName)
  const deleteFieldName = directiveArguments.mutations?.delete
    ? directiveArguments.mutations.delete
    : ResolverNames.DeleteResolver(typeName)

  const conditionInputName = ModelTypeNames.ModelConditionInputTypeName(typeName)

  // Create the mutations.
  if (shouldMakeCreate) {
    const createInput = makeCreateInputObject(def, nonModelArray, ctx)
    if (!ctx.getType(createInput.name.value)) {
      ctx.addInput(createInput)
    }
    const createResolver = resources.makeCreateResolver(createFieldName)

    const resourceId = ResolverTypeNames.CreateResolverResourceID(typeName)
    ctx.setResource(resourceId, createResolver)

    const args = [
      makeInputValueDefinition(INPUT_TYPE_NAME_DATA, makeNonNullType(makeNamedType(createInput.name.value))),
    ]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition(INPUT_TYPE_NAME_WHERE, makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(createResolver.fieldName, args, makeNamedType(def.name.value)))
  }

  if (shouldMakeUpdate) {
    const updateInput = makeUpdateInputObject(def, nonModelArray, ctx)
    if (!ctx.getType(updateInput.name.value)) {
      ctx.addInput(updateInput)
    }
    const updateResolver = resources.makeUpdateResolver(updateFieldName)

    const resourceId = ResolverTypeNames.UpdateResolverResourceID(typeName)
    ctx.setResource(resourceId, updateResolver)

    const args = [
      makeInputValueDefinition(INPUT_TYPE_NAME_DATA, makeNonNullType(makeNamedType(updateInput.name.value))),
    ]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition(INPUT_TYPE_NAME_WHERE, makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(updateResolver.fieldName, args, makeNamedType(def.name.value)))
  }

  if (shouldMakeDelete) {
    const deleteInput = makeDeleteInputObject(def)
    if (!ctx.getType(deleteInput.name.value)) {
      ctx.addInput(deleteInput)
    }
    const deleteResolver = resources.makeDeleteResolver(deleteFieldName)

    const resourceId = ResolverTypeNames.DeleteResolverResourceID(typeName)
    ctx.setResource(resourceId, deleteResolver)

    const args = [
      makeInputValueDefinition(INPUT_TYPE_NAME_DATA, makeNonNullType(makeNamedType(deleteInput.name.value))),
    ]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition(INPUT_TYPE_NAME_WHERE, makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(deleteResolver.fieldName, args, makeNamedType(def.name.value)))
  }
  ctx.addMutationFields(mutationFields)

  if (shouldMakeCreate || shouldMakeUpdate || shouldMakeDelete) {
    generateConditionInputs(ctx, def)
  }
}

export const createQueries = ({ def, directive, ctx, resources, resolvers }: CreateFunctionArgs) => {
  const typeName = def.name.value
  const queryFields: FieldDefinitionNode[] = []
  const directiveArguments = getDirectiveArguments(directive)

  // Configure queries based on *queries* argument
  const shouldMakeGet = resolvers.hasOwnProperty('get')
  const shouldMakeList = resolvers.hasOwnProperty('list')

  const getFieldName = directiveArguments.queries?.get
    ? directiveArguments.queries.get
    : ResolverNames.GetResolver(typeName)
  const listFieldName = directiveArguments.queries?.list
    ? directiveArguments.queries.list
    : ResolverNames.ListResolver(typeName)

  if (shouldMakeList) {
    if (!typeExist('ModelSortDirection', ctx)) {
      const tableSortDirection = makeModelSortDirectionEnumObject()
      ctx.addEnum(tableSortDirection)
    }
  }

  // Create get queries
  if (shouldMakeGet) {
    const getResolver = resources.makeGetResolver(getFieldName, ctx.getTypenameByOperation('query'))

    const resourceId = ResolverTypeNames.GetResolverResourceID(typeName)
    ctx.setResource(resourceId, getResolver)

    queryFields.push(
      makeField(
        getResolver.fieldName.toString(),
        [makeInputValueDefinition('id', makeNonNullType(makeNamedType('ID')))],
        makeNamedType(def.name.value)
      )
    )
  }

  if (shouldMakeList) {
    generateModelXConnectionType(ctx, def)

    // Create the list resolver
    const listResolver = resources.makeListResolver(listFieldName, ctx.getTypenameByOperation('query'))
    const resourceId = ResolverTypeNames.ListResolverResourceID(typeName)
    ctx.setResource(resourceId, listResolver)

    queryFields.push(makeConnectionField(listResolver.fieldName, def.name.value))
  }
  generateFilterInputs(ctx, def)

  ctx.addQueryFields(queryFields)
}

/**
 * Creates subscriptions for a @model object type. By default creates a subscription for
 * create, update, and delete mutations.
 *
 * Subscriptions are one to many in that a subscription may subscribe to multiple mutations.
 * You may thus provide multiple names of the subscriptions that will be triggered by each
 * mutation.
 *
 * type Post @model(subscriptions: { onCreate: ["onPostCreated", "onFeedUpdated"] }) {
 *      id: ID!
 *      title: String!
 * }
 *
 * will create two subscription fields:
 *
 * type Subscription {
 *      onPostCreated: Post @aws_subscribe(mutations: ["createPost"])
 *      onFeedUpdated: Post @aws_subscribe(mutations: ["createPost"])
 * }
 *  Subscription Levels
 *   subscriptions.level === OFF || subscriptions === null
 *      Will not create subscription operations
 *   subcriptions.level === PUBLIC
 *      Will continue as is creating subscription operations
 *   subscriptions.level === ON || subscriptions === undefined
 *      If auth is enabled it will enabled protection on subscription operations and resolvers
 */
export const createSubscriptions = ({ def, directive, ctx }: CreateFunctionArgs) => {
  const typeName = def.name.value
  const subscriptionFields: FieldDefinitionNode[] = []

  const directiveArguments = getDirectiveArguments(directive)

  const subscriptionsArgument = directiveArguments.subscriptions
  const createResolver = ctx.getResource(ResolverTypeNames.CreateResolverResourceID(typeName))
  const updateResolver = ctx.getResource(ResolverTypeNames.UpdateResolverResourceID(typeName))
  const deleteResolver = ctx.getResource(ResolverTypeNames.DeleteResolverResourceID(typeName))

  if (subscriptionsArgument === null) {
    return
  }
  if (subscriptionsArgument && subscriptionsArgument.level === 'off') {
    return
  }
  if (
    subscriptionsArgument &&
    (subscriptionsArgument.onCreate || subscriptionsArgument.onUpdate || subscriptionsArgument.onDelete)
  ) {
    // Add the custom subscriptions
    const subscriptionToMutationsMap: { [subField: string]: string[] } = {}
    const onCreate = subscriptionsArgument.onCreate || []
    const onUpdate = subscriptionsArgument.onUpdate || []
    const onDelete = subscriptionsArgument.onDelete || []
    const subFields = [...onCreate, ...onUpdate, ...onDelete]
    // initialize the reverse lookup
    for (const field of subFields) {
      subscriptionToMutationsMap[field] = []
    }
    // Add the correct mutation to the lookup
    for (const field of Object.keys(subscriptionToMutationsMap)) {
      if (onCreate.includes(field) && createResolver) {
        subscriptionToMutationsMap[field].push(createResolver.fieldName)
      }
      if (onUpdate.includes(field) && updateResolver) {
        subscriptionToMutationsMap[field].push(updateResolver.fieldName)
      }
      if (onDelete.includes(field) && deleteResolver) {
        subscriptionToMutationsMap[field].push(deleteResolver.fieldName)
      }
    }
    for (const subFieldName of Object.keys(subscriptionToMutationsMap)) {
      const subField = makeSubscriptionField(subFieldName, typeName, subscriptionToMutationsMap[subFieldName])
      subscriptionFields.push(subField)
    }
  } else {
    // Add the default subscriptions
    if (createResolver) {
      const onCreateField = makeSubscriptionField(ModelTypeNames.ModelOnCreateSubscriptionName(typeName), typeName, [
        createResolver.fieldName,
      ])
      subscriptionFields.push(onCreateField)
    }
    if (updateResolver) {
      const onUpdateField = makeSubscriptionField(ModelTypeNames.ModelOnUpdateSubscriptionName(typeName), typeName, [
        updateResolver.fieldName,
      ])
      subscriptionFields.push(onUpdateField)
    }
    if (deleteResolver) {
      const onDeleteField = makeSubscriptionField(ModelTypeNames.ModelOnDeleteSubscriptionName(typeName), typeName, [
        deleteResolver.fieldName,
      ])
      subscriptionFields.push(onDeleteField)
    }
  }

  ctx.addSubscriptionFields(subscriptionFields)
}

export const typeExist = (type: string, ctx: TransformerContext) => !!(type in ctx.nodeMap)

export const generateModelXConnectionType = (
  ctx: TransformerContext,
  def: ObjectTypeDefinitionNode,
  isSync: Boolean = false
) => {
  const tableXConnectionName = ModelTypeNames.ModelConnectionTypeName(def.name.value)
  if (typeExist(tableXConnectionName, ctx)) {
    return
  }

  // Create the ModelXConnection
  const connectionType = makeObjectDefinition(tableXConnectionName)
  ctx.addObject(connectionType)
  ctx.addObjectExtension(makeModelConnectionType(def.name.value, isSync))
}

export const generateFilterInputs = (ctx: TransformerContext, def: ObjectTypeDefinitionNode) => {
  const scalarFilters = makeScalarFilterInputs(supportsConditions(ctx))
  for (const filter of scalarFilters) {
    if (!typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the Enum filters
  const enumFilters = makeEnumFilterInputObjects(def, ctx, supportsConditions(ctx))
  for (const filter of enumFilters) {
    if (!typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the ModelXFilterInput
  const tableXQueryFilterInput = makeModelXFilterInputObject(def, ctx, supportsConditions(ctx))
  if (!typeExist(tableXQueryFilterInput.name.value, ctx)) {
    ctx.addInput(tableXQueryFilterInput)
  }
}

export const generateConditionInputs = (ctx: TransformerContext, def: ObjectTypeDefinitionNode) => {
  const scalarFilters = makeScalarFilterInputs(supportsConditions(ctx))
  for (const filter of scalarFilters) {
    if (!typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the Enum filters
  const enumFilters = makeEnumFilterInputObjects(def, ctx, supportsConditions(ctx))
  for (const filter of enumFilters) {
    if (!typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  if (supportsConditions(ctx)) {
    // Create the ModelXConditionInput
    const tableXMutationConditionInput = makeModelXConditionInputObject(def, ctx, supportsConditions(ctx))
    if (!typeExist(tableXMutationConditionInput.name.value, ctx)) {
      ctx.addInput(tableXMutationConditionInput)
    }
  }
}

// Due to the current architecture of Transformers we've to handle the 'id' field removal
// here, because KeyTranformer will not be invoked if there are no @key directives declared
// on the type.
export const updateMutationConditionInput = (ctx: TransformerContext, type: ObjectTypeDefinitionNode) => {
  if (supportsConditions(ctx)) {
    // Get the existing ModelXConditionInput
    const tableXMutationConditionInputName = ModelTypeNames.ModelConditionInputTypeName(type.name.value)

    if (typeExist(tableXMutationConditionInputName, ctx)) {
      const tableXMutationConditionInput = <InputObjectTypeDefinitionNode>ctx.getType(tableXMutationConditionInputName)

      const keyDirectives = type.directives?.filter(d => d.name.value === 'key')

      // If there are @key directives defined we've nothing to do, it will handle everything
      if (keyDirectives && keyDirectives.length > 0) {
        return
      }

      // Remove the field named 'id' from the condition if there is one
      const idField = tableXMutationConditionInput.fields?.find(f => f.name.value === 'id')

      if (idField) {
        const reducedFields = tableXMutationConditionInput.fields?.filter(f => Boolean(f.name.value !== 'id'))

        const updatedInput = {
          ...tableXMutationConditionInput,
          fields: reducedFields,
        }

        ctx.putType(updatedInput)
      }
    }
  }
}
