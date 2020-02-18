import {
  print,
  TypeSystemDefinitionNode,
  DocumentNode,
  parse,
  Kind,
  TypeDefinitionNode,
  ObjectTypeDefinitionNode,
  SchemaDefinitionNode,
  OperationTypeDefinitionNode,
  OperationTypeNode,
  ObjectTypeExtensionNode,
  FieldDefinitionNode,
  NamedTypeNode,
  InputObjectTypeDefinitionNode,
  EnumTypeDefinitionNode,
} from 'graphql'
import DefaultSchema from './defaultSchema'
import { stripDirectives } from './stripDirectives'
import { blankObject, makeOperationType, objectExtension } from './transformer-common'

export const MUTATION = 'mutation'
export const QUERY = 'query'
export const SUBSCRIPTION = 'subscription'

export type Operation = typeof MUTATION | typeof QUERY | typeof SUBSCRIPTION

export const buildSchema = (ctx: TransformerContext) => {
  const mutationNode = ctx.getMutation()
  const queryNode = ctx.getQuery()
  const subscriptionNode = ctx.getSubscription()
  const includeMutation = mutationNode && !!mutationNode.fields.length
  const includeQuery = queryNode && !!queryNode.fields.length
  const includeSubscription = subscriptionNode && !!subscriptionNode.fields.length

  const operationTypes: OperationTypeDefinitionNode[] = []
  if (includeQuery) operationTypes.push(makeOperationType('query', queryNode.name.value))
  if (includeMutation) operationTypes.push(makeOperationType('mutation', mutationNode.name.value))
  if (includeSubscription) operationTypes.push(makeOperationType('subscription', subscriptionNode.name.value))

  const definitions = Object.keys(ctx.nodeMap).map((k: string) => ctx.getType(k))

  return print(
    stripDirectives({
      kind: 'Document',
      definitions,
    })
  )
}

export class TransformerContext<Resource = any> {
  public document: DocumentNode
  public schema = DefaultSchema
  public nodeMap: Record<string, TypeSystemDefinitionNode> = {}
  public resources: Record<string, Resource> = {}

  constructor(input: string) {
    this.document = parse(input)
    this.fillNodeMapWithInput()
  }

  /**
   * Before running the transformers, first flush the input document
   * into the node map. If a schema definition node then leave everything
   * as is so customers can explicitly turn off mutations & subscriptions.
   * If a SDN is not provided then we add the default schema and empty
   * Query, Mutation, and Subscription
   */
  private fillNodeMapWithInput() {
    const extensionNodes = []
    for (const inputDef of this.document.definitions) {
      switch (inputDef.kind) {
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.SCALAR_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.UNION_TYPE_DEFINITION:
          this.addType(inputDef)
          break
        case Kind.SCHEMA_DEFINITION:
          this.schema = inputDef
          break
        case Kind.OBJECT_TYPE_EXTENSION:
        case Kind.ENUM_TYPE_EXTENSION:
        case Kind.UNION_TYPE_EXTENSION:
        case Kind.INTERFACE_TYPE_EXTENSION:
        case Kind.INPUT_OBJECT_TYPE_EXTENSION:
          extensionNodes.push(inputDef)
          break
        case Kind.SCALAR_TYPE_EXTENSION:
        default:
        /* pass any others */
      }
    }

    // We add the extension nodes last so that the order of input documents does not matter.
    // At this point, all input documents have been processed so the base types will be present.
    for (const ext of extensionNodes) {
      switch (ext.kind) {
        case Kind.OBJECT_TYPE_EXTENSION:
          this.addObjectExtension(ext)
          break
        // case Kind.INTERFACE_TYPE_EXTENSION:
        //   this.addInterfaceExtension(ext)
        //   break
        // case Kind.UNION_TYPE_EXTENSION:
        //   this.addUnionExtension(ext)
        //   break
        // case Kind.ENUM_TYPE_EXTENSION:
        //   this.addEnumExtension(ext)
        //   break
        // case Kind.INPUT_OBJECT_TYPE_EXTENSION:
        //   this.addInputExtension(ext)
        //   break
        case Kind.SCALAR_TYPE_EXTENSION:
        default:
          continue
      }
    }
  }

  public getType = (name: string) => this.nodeMap[name]

  /**
   * Add a generic type. Will override existing types
   * @param obj The type to add
   */
  public putType = (obj: TypeDefinitionNode) => {
    this.nodeMap[obj.name.value] = obj
  }

  /**
   * Add a generic type.
   * @param obj The type to add
   */
  public addType = (obj: TypeDefinitionNode) => {
    if (this.nodeMap[obj.name.value]) throw new Error(`Conflicting type '${obj.name.value}' found.`)

    this.putType(obj)
  }

  public getTypenameByOperation = (operation: Operation) => {
    const schemaNode = this.getSchema()
    const mutationTypeName = schemaNode.operationTypes.find(node => node.operation === operation)
    if (mutationTypeName && mutationTypeName.type && mutationTypeName.type.name) return mutationTypeName.type.name.value
  }

  public getNodeByOperation = (operation: Operation) => {
    const typename = this.getTypenameByOperation(operation)
    return typename && (this.nodeMap[typename] as ObjectTypeDefinitionNode)
  }

  public getSchema = () => this.schema
  public getQuery = () => this.getNodeByOperation(QUERY)
  public getMutation = () => this.getNodeByOperation(MUTATION)
  public getSubscription = () => this.getNodeByOperation(SUBSCRIPTION)

  public getObject = (name: string) => {
    if (this.nodeMap[name]) {
      const node = this.nodeMap[name]
      if (node.kind === Kind.OBJECT_TYPE_DEFINITION) return node
    }
  }

  /**
   * Add an object type extension definition node to the context. If a type with this
   * name does not already exist, an exception is thrown.
   * @param obj The object type definition node to add.
   */
  public addObjectExtension(obj: ObjectTypeExtensionNode) {
    if (!this.nodeMap[obj.name.value]) {
      throw new Error(`Cannot extend non-existant type '${obj.name.value}'.`)
    }
    // AppSync does not yet understand type extensions so fold the types in.
    const oldNode = this.getObject(obj.name.value)
    const newDirs = []
    const oldDirs = oldNode.directives || []

    // Filter out duplicate directives, do not add them
    if (obj.directives) {
      const oldDirectives = (oldNode.directives || []).map(node => node.name.value)
      for (const newDir of obj.directives) if (!oldDirectives.includes(newDir.name.value)) newDirs.push(newDir)
    }

    const mergedDirs = [...oldDirs, ...newDirs]

    // An extension cannot redeclare fields.
    const oldFields = oldNode.fields || []
    const oldFieldMap = oldFields.reduce(
      (acc, field) => ({
        ...acc,
        [field.name.value]: field,
      }),
      {} as Record<string, FieldDefinitionNode>
    )
    const newFields = obj.fields || []
    const mergedFields = [...oldFields]
    for (const newField of newFields) {
      if (oldFieldMap[newField.name.value]) {
        throw new Error(`Object type extension '${obj.name.value}' cannot redeclare field ${newField.name.value}`)
      }
      mergedFields.push(newField)
    }

    // An extension cannot redeclare interfaces
    const oldInterfaces = oldNode.interfaces || []
    const oldInterfaceMap = oldInterfaces.reduce(
      (acc, field) => ({
        ...acc,
        [field.name.value]: field,
      }),
      {} as Record<string, NamedTypeNode>
    )
    const newInterfaces = obj.interfaces || []
    const mergedInterfaces = [...oldInterfaces]
    for (const newInterface of newInterfaces) {
      if (oldInterfaceMap[newInterface.name.value]) {
        throw new Error(
          `Object type extension '${obj.name.value}' cannot redeclare interface ${newInterface.name.value}`
        )
      }
      mergedInterfaces.push(newInterface)
    }
    this.nodeMap[oldNode.name.value] = {
      ...oldNode,
      interfaces: mergedInterfaces,
      directives: mergedDirs,
      fields: mergedFields,
    }
  }

  private addNodeFields = (operation: Operation, fields: FieldDefinitionNode[]) => {
    const typename = this.getTypenameByOperation(operation)
    const node = this.getNodeByOperation(operation)
    if (!node) this.addType(blankObject(typename))
    let nodeType = objectExtension(typename, fields)
    this.addObjectExtension(nodeType)
  }

  public addEnum = (node: EnumTypeDefinitionNode) => this.addType(node)
  public addInput = (node: InputObjectTypeDefinitionNode) => this.addType(node)
  public addObject = (node: ObjectTypeDefinitionNode) => this.addType(node)
  public addMutationFields = (fields: FieldDefinitionNode[]) => this.addNodeFields(MUTATION, fields)
  public addQueryFields = (fields: FieldDefinitionNode[]) => this.addNodeFields(QUERY, fields)
  public addSubscriptionFields = (fields: FieldDefinitionNode[]) => this.addNodeFields(SUBSCRIPTION, fields)

  public getResource = (resourceName: string) => this.resources[resourceName]
  public setResource = (resourceName: string, resource: Resource) => {
    this.resources[resourceName] = resource
  }
}
