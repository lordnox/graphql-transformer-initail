import { ObjectTypeDefinitionNode, DirectiveNode, FieldDefinitionNode, InputObjectTypeDefinitionNode } from 'graphql'
import { TransformerContext } from '../transformer-core'
import { getDirectiveArguments } from '../utils'
import {
  ModelResourceIDs,
  makeInputValueDefinition,
  makeNonNullType,
  makeNamedType,
  makeField,
  ResolverResourceIDs,
  makeConnectionField,
  blankObject,
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

export const supportsConditions = (_ctx: TransformerContext) => true

export interface CreateFunctionArgs {
  def: ObjectTypeDefinitionNode
  directive: DirectiveNode
  ctx: TransformerContext
  resources: ResourceFactory
  nonModelArray: ObjectTypeDefinitionNode[]
}

export const createMutations = ({ def, directive, ctx, resources, nonModelArray }: CreateFunctionArgs) => {
  const typeName = def.name.value

  const mutationFields: FieldDefinitionNode[] = []
  // Get any name overrides provided by the user. If an empty map it provided
  // then we do not generate those fields.
  const directiveArguments = getDirectiveArguments(directive)

  // Configure mutations based on *mutations* argument
  let shouldMakeCreate = resources.model.resolvers.hasOwnProperty('create')
  let shouldMakeUpdate = resources.model.resolvers.hasOwnProperty('update')
  let shouldMakeDelete = resources.model.resolvers.hasOwnProperty('delete')
  let createFieldNameOverride = undefined
  let updateFieldNameOverride = undefined
  let deleteFieldNameOverride = undefined

  // Figure out which mutations to make and if they have name overrides
  if (directiveArguments.mutations === null) {
    shouldMakeCreate = false
    shouldMakeUpdate = false
    shouldMakeDelete = false
  } else if (directiveArguments.mutations) {
    if (!directiveArguments.mutations.create) {
      shouldMakeCreate = false
    } else {
      createFieldNameOverride = directiveArguments.mutations.create
    }
    if (!directiveArguments.mutations.update) {
      shouldMakeUpdate = false
    } else {
      updateFieldNameOverride = directiveArguments.mutations.update
    }
    if (!directiveArguments.mutations.delete) {
      shouldMakeDelete = false
    } else {
      deleteFieldNameOverride = directiveArguments.mutations.delete
    }
  }

  const conditionInputName = ModelResourceIDs.ModelConditionInputTypeName(typeName)

  // Create the mutations.
  if (shouldMakeCreate) {
    const createInput = makeCreateInputObject(def, nonModelArray, ctx)
    if (!ctx.getType(createInput.name.value)) {
      ctx.addInput(createInput)
    }
    const createResolver = resources.makeCreateResolver(def.name.value, createFieldNameOverride)

    const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(createInput.name.value)))]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(createResolver.fieldName, args, makeNamedType(def.name.value)))
  }

  if (shouldMakeUpdate) {
    const updateInput = makeUpdateInputObject(def, nonModelArray, ctx)
    if (!ctx.getType(updateInput.name.value)) {
      ctx.addInput(updateInput)
    }
    const updateResolver = resources.makeUpdateResolver(def.name.value, updateFieldNameOverride)

    const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(updateInput.name.value)))]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(updateResolver.fieldName, args, makeNamedType(def.name.value)))
  }

  if (shouldMakeDelete) {
    const deleteInput = makeDeleteInputObject(def)
    if (!ctx.getType(deleteInput.name.value)) {
      ctx.addInput(deleteInput)
    }
    const deleteResolver = resources.makeDeleteResolver(def.name.value, deleteFieldNameOverride)

    const args = [makeInputValueDefinition('input', makeNonNullType(makeNamedType(deleteInput.name.value)))]
    if (supportsConditions(ctx)) {
      args.push(makeInputValueDefinition('condition', makeNamedType(conditionInputName)))
    }
    mutationFields.push(makeField(deleteResolver.fieldName, args, makeNamedType(def.name.value)))
  }
  ctx.addMutationFields(mutationFields)

  if (shouldMakeCreate || shouldMakeUpdate || shouldMakeDelete) {
    this.generateConditionInputs(ctx, def)
  }
}

export const createQueries = ({ def, directive, ctx, resources }: CreateFunctionArgs) => {
  const typeName = def.name.value
  const queryFields: FieldDefinitionNode[] = []
  const directiveArguments = getDirectiveArguments(directive)

  // Configure queries based on *queries* argument
  let shouldMakeGet = true
  let shouldMakeList = true
  let getFieldNameOverride: string = undefined
  let listFieldNameOverride: string = undefined

  // Figure out which queries to make and if they have name overrides.
  // If queries is undefined (default), create all queries
  // If queries is explicetly set to null, do not create any
  // else if queries is defined, check overrides
  if (directiveArguments.queries === null) {
    shouldMakeGet = false
    shouldMakeList = false
  } else if (directiveArguments.queries) {
    if (!directiveArguments.queries.get) {
      shouldMakeGet = false
    } else {
      getFieldNameOverride = directiveArguments.queries.get
    }
    if (!directiveArguments.queries.list) {
      shouldMakeList = false
    } else {
      listFieldNameOverride = directiveArguments.queries.list
    }
  }

  if (shouldMakeList) {
    if (!this.typeExist('ModelSortDirection', ctx)) {
      const tableSortDirection = makeModelSortDirectionEnumObject()
      ctx.addEnum(tableSortDirection)
    }
  }

  // Create get queries
  if (shouldMakeGet) {
    const getResolver = resources.makeGetResolver(
      def.name.value,
      getFieldNameOverride,
      ctx.getTypenameByOperation('query')
    )

    const resourceId = ResolverResourceIDs.GetResolverResourceID(typeName)
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
    this.generateModelXConnectionType(ctx, def)

    // Create the list resolver
    const listResolver = resources.makeListResolver(
      def.name.value,
      listFieldNameOverride,
      ctx.getTypenameByOperation('query')
    )
    const resourceId = ResolverResourceIDs.ListResolverResourceID(typeName)
    ctx.setResource(resourceId, listResolver)

    queryFields.push(makeConnectionField(listResolver.fieldName, def.name.value))
  }
  this.generateFilterInputs(ctx, def)

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
  const createResolver = ctx.getResource(ResolverResourceIDs.CreateResolverResourceID(typeName))
  const updateResolver = ctx.getResource(ResolverResourceIDs.UpdateResolverResourceID(typeName))
  const deleteResolver = ctx.getResource(ResolverResourceIDs.DeleteResolverResourceID(typeName))

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
      const onCreateField = makeSubscriptionField(ModelResourceIDs.ModelOnCreateSubscriptionName(typeName), typeName, [
        createResolver.fieldName,
      ])
      subscriptionFields.push(onCreateField)
    }
    if (updateResolver) {
      const onUpdateField = makeSubscriptionField(ModelResourceIDs.ModelOnUpdateSubscriptionName(typeName), typeName, [
        updateResolver.fieldName,
      ])
      subscriptionFields.push(onUpdateField)
    }
    if (deleteResolver) {
      const onDeleteField = makeSubscriptionField(ModelResourceIDs.ModelOnDeleteSubscriptionName(typeName), typeName, [
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
  const tableXConnectionName = ModelResourceIDs.ModelConnectionTypeName(def.name.value)
  if (this.typeExist(tableXConnectionName, ctx)) {
    return
  }

  // Create the ModelXConnection
  const connectionType = blankObject(tableXConnectionName)
  ctx.addObject(connectionType)
  ctx.addObjectExtension(makeModelConnectionType(def.name.value, isSync))
}

export const generateFilterInputs = (ctx: TransformerContext, def: ObjectTypeDefinitionNode) => {
  const scalarFilters = makeScalarFilterInputs(supportsConditions(ctx))
  for (const filter of scalarFilters) {
    if (!this.typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the Enum filters
  const enumFilters = makeEnumFilterInputObjects(def, ctx, supportsConditions(ctx))
  for (const filter of enumFilters) {
    if (!this.typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the ModelXFilterInput
  const tableXQueryFilterInput = makeModelXFilterInputObject(def, ctx, supportsConditions(ctx))
  if (!this.typeExist(tableXQueryFilterInput.name.value, ctx)) {
    ctx.addInput(tableXQueryFilterInput)
  }
}

export const generateConditionInputs = (ctx: TransformerContext, def: ObjectTypeDefinitionNode) => {
  const scalarFilters = makeScalarFilterInputs(supportsConditions(ctx))
  for (const filter of scalarFilters) {
    if (!this.typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  // Create the Enum filters
  const enumFilters = makeEnumFilterInputObjects(def, ctx, supportsConditions(ctx))
  for (const filter of enumFilters) {
    if (!this.typeExist(filter.name.value, ctx)) {
      ctx.addInput(filter)
    }
  }

  if (supportsConditions(ctx)) {
    // Create the ModelXConditionInput
    const tableXMutationConditionInput = makeModelXConditionInputObject(def, ctx, supportsConditions(ctx))
    if (!this.typeExist(tableXMutationConditionInput.name.value, ctx)) {
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
    const tableXMutationConditionInputName = ModelResourceIDs.ModelConditionInputTypeName(type.name.value)

    if (this.typeExist(tableXMutationConditionInputName, ctx)) {
      const tableXMutationConditionInput = <InputObjectTypeDefinitionNode>ctx.getType(tableXMutationConditionInputName)

      const keyDirectives = type.directives.filter(d => d.name.value === 'key')

      // If there are @key directives defined we've nothing to do, it will handle everything
      if (keyDirectives && keyDirectives.length > 0) {
        return
      }

      // Remove the field named 'id' from the condition if there is one
      const idField = tableXMutationConditionInput.fields.find(f => f.name.value === 'id')

      if (idField) {
        const reducedFields = tableXMutationConditionInput.fields.filter(f => Boolean(f.name.value !== 'id'))

        const updatedInput = {
          ...tableXMutationConditionInput,
          fields: reducedFields,
        }

        ctx.putType(updatedInput)
      }
    }
  }
}
