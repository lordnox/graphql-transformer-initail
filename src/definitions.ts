import {
  ObjectTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  FieldDefinitionNode,
  Kind,
  TypeNode,
  EnumTypeDefinitionNode,
  ObjectTypeExtensionNode,
  NamedTypeNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  EnumValueDefinitionNode,
} from 'graphql'
import {
  wrapNonNull,
  unwrapNonNull,
  makeNamedType,
  toUpper,
  graphqlName,
  makeListType,
  isScalar,
  getBaseTypeName,
  extensionWithFields,
  makeField,
  makeInputValueDefinition,
  ModelTypeNames,
  makeDirective,
  makeArgument,
  makeValueNode,
  withNamedNodeNamed,
  isListType,
  objectExtension,
} from './transformer-common'
import { TransformerContext } from './transformer-core'

export const STRING_CONDITIONS = ['ne', 'eq', 'le', 'lt', 'ge', 'gt', 'in', 'notIn']
export const ID_CONDITIONS = ['ne', 'eq', 'le', 'lt', 'ge', 'gt', 'in', 'notIn']
export const INT_CONDITIONS = ['ne', 'eq', 'le', 'lt', 'ge', 'gt', 'between']
export const FLOAT_CONDITIONS = ['ne', 'eq', 'le', 'lt', 'ge', 'gt', 'between']
export const BOOLEAN_CONDITIONS = ['ne', 'eq']
export const SIZE_CONDITIONS = ['ne', 'eq', 'le', 'lt', 'ge', 'gt', 'between']

export const JOIN_TYPE_AND = '_and'
export const JOIN_TYPE_OR = '_or'
export const JOIN_TYPE_NOT = '_not'

export const STRING_FUNCTIONS = new Set<string>([]) // 'attributeExists', 'attributeType', 'size'
export const ID_FUNCTIONS = new Set<string>([]) // 'attributeExists', 'attributeType', 'size'
export const INT_FUNCTIONS = new Set<string>([]) // 'attributeExists', 'attributeType'
export const FLOAT_FUNCTIONS = new Set<string>([]) // 'attributeExists', 'attributeType'
export const BOOLEAN_FUNCTIONS = new Set<string>([]) // 'attributeExists', 'attributeType'

export function getNonModelObjectArray(
  node: ObjectTypeDefinitionNode,
  ctx: TransformerContext,
  nodeMap: Map<string, ObjectTypeDefinitionNode>
): ObjectTypeDefinitionNode[] {
  // loop over all fields in the object, picking out all nonscalars that are not @model types
  for (const field of node.fields || []) {
    if (!isScalar(field.type)) {
      const def = ctx.getType(getBaseTypeName(field.type))

      if (
        def &&
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        !def.directives?.find(e => e.name.value === 'model') &&
        nodeMap.get(def.name.value) === undefined
      ) {
        // recursively find any non @model types referenced by the current
        // non @model type
        nodeMap.set(def.name.value, def)
        getNonModelObjectArray(def, ctx, nodeMap)
      }
    }
  }

  return Array.from(nodeMap.values())
}

export function makeNonModelInputObject(
  obj: ObjectTypeDefinitionNode,
  nonModelTypes: ObjectTypeDefinitionNode[],
  ctx: TransformerContext
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.NonModelInputObjectName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [...(obj.fields || [])]
    .filter((field: FieldDefinitionNode) => {
      const fieldType = ctx.getType(getBaseTypeName(field.type))
      if (
        isScalar(field.type) ||
        nonModelTypes.find(e => e.name.value === getBaseTypeName(field.type)) ||
        (fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION)
      ) {
        return true
      }
      return false
    })
    .map((field: FieldDefinitionNode) => {
      const type = nonModelTypes.find(e => e.name.value === getBaseTypeName(field.type))
        ? withNamedNodeNamed(field.type, ModelTypeNames.NonModelInputObjectName(getBaseTypeName(field.type)))
        : field.type
      return {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type,
        // TODO: Service does not support new style descriptions so wait.
        // description: field.description,
        directives: [],
      }
    })
  return {
    kind: 'InputObjectTypeDefinition',
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeCreateInputObject(
  obj: ObjectTypeDefinitionNode,
  nonModelTypes: ObjectTypeDefinitionNode[],
  ctx: TransformerContext
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelCreateInputObjectName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [...(obj.fields || [])]
    .filter((field: FieldDefinitionNode) => {
      const fieldType = ctx.getType(getBaseTypeName(field.type))
      if (
        isScalar(field.type) ||
        nonModelTypes.find(e => e.name.value === getBaseTypeName(field.type)) ||
        (fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION)
      ) {
        return true
      }
      return false
    })
    .map((field: FieldDefinitionNode) => {
      let type: TypeNode
      if (field.name.value === 'id') {
        // ids are always optional. when provided the value is used.
        // when not provided the value is not used.
        type = {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: 'ID',
          },
        }
      } else {
        type = nonModelTypes.find(e => e.name.value === getBaseTypeName(field.type))
          ? withNamedNodeNamed(field.type, ModelTypeNames.NonModelInputObjectName(getBaseTypeName(field.type)))
          : field.type
      }
      return {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type,
        // TODO: Service does not support new style descriptions so wait.
        // description: field.description,
        directives: [],
      }
    })

  return {
    kind: 'InputObjectTypeDefinition',
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeUpdateInputObject(
  obj: ObjectTypeDefinitionNode,
  nonModelTypes: ObjectTypeDefinitionNode[],
  ctx: TransformerContext,
  isSync: boolean = false
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelUpdateInputObjectName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [...(obj.fields || [])]
    .filter(f => {
      const fieldType = ctx.getType(getBaseTypeName(f.type))
      if (
        isScalar(f.type) ||
        nonModelTypes.find(e => e.name.value === getBaseTypeName(f.type)) ||
        (fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION)
      ) {
        return true
      }
      return false
    })
    .map((field: FieldDefinitionNode) => {
      let type
      if (field.name.value === 'id') {
        type = wrapNonNull(field.type)
      } else {
        type = unwrapNonNull(field.type)
      }
      type = nonModelTypes.find(e => e.name.value === getBaseTypeName(field.type))
        ? withNamedNodeNamed(type, ModelTypeNames.NonModelInputObjectName(getBaseTypeName(field.type)))
        : type
      return {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type,
        // TODO: Service does not support new style descriptions so wait.
        // description: field.description,
        directives: [],
      }
    })
  if (isSync) {
    fields.push(makeInputValueDefinition('_version', makeNamedType('Int')))
  }
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeDeleteInputObject(
  obj: ObjectTypeDefinitionNode,
  isSync: boolean = false
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelDeleteInputObjectName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: 'Name', value: 'id' },
      type: makeNamedType('ID'),
      // TODO: Service does not support new style descriptions so wait.
      // description: {
      //     kind: 'StringValue',
      //     value: `The id of the ${obj.name.value} to delete.`
      // },
      directives: [],
    },
  ]
  if (isSync) {
    fields.push(makeInputValueDefinition('_version', makeNamedType('Int')))
  }
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} delete mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeModelXFilterInputObject(
  obj: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
  ctx: TransformerContext,
  supportsConditions: Boolean
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelFilterInputTypeName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [...(obj.fields || [])]
    .filter((field: FieldDefinitionNode) => {
      const fieldType = ctx.getType(getBaseTypeName(field.type))
      return isScalar(field.type) || (fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION)
    })
    .map((field: FieldDefinitionNode) => {
      const baseType = getBaseTypeName(field.type)
      const fieldType = ctx.getType(baseType)
      const isList = isListType(field.type)
      const isEnumType = fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION
      const filterTypeName =
        isEnumType && isList
          ? ModelTypeNames.ModelFilterListInputTypeName(baseType, !supportsConditions)
          : ModelTypeNames.ModelScalarFilterInputTypeName(baseType, !supportsConditions)

      return {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type: makeNamedType(filterTypeName),
        // TODO: Service does not support new style descriptions so wait.
        // description: field.description,
        directives: [],
      }
    })

  fields.push(
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_AND,
      },
      type: makeListType(makeNamedType(name)),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_OR,
      },
      type: makeListType(makeNamedType(name)),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_NOT,
      },
      type: makeNamedType(name),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    }
  )

  return {
    kind: 'InputObjectTypeDefinition',
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeModelXConditionInputObject(
  obj: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
  ctx: TransformerContext,
  supportsConditions: Boolean
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelConditionInputTypeName(obj.name.value)
  const fields: InputValueDefinitionNode[] = [...(obj.fields || [])]
    .filter((field: FieldDefinitionNode) => {
      const fieldType = ctx.getType(getBaseTypeName(field.type))
      return isScalar(field.type) || (fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION)
    })
    .map((field: FieldDefinitionNode) => {
      const baseType = getBaseTypeName(field.type)
      const fieldType = ctx.getType(baseType)
      const isList = isListType(field.type)
      const isEnumType = fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION
      const conditionTypeName =
        isEnumType && isList
          ? ModelTypeNames.ModelFilterListInputTypeName(baseType, !supportsConditions)
          : ModelTypeNames.ModelScalarFilterInputTypeName(baseType, !supportsConditions)

      return {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: field.name,
        type: makeNamedType(conditionTypeName),
        // TODO: Service does not support new style descriptions so wait.
        // description: field.description,
        directives: [],
      }
    })

  fields.push(
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_AND,
      },
      type: makeListType(makeNamedType(name)),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_OR,
      },
      type: makeListType(makeNamedType(name)),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    },
    {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: {
        kind: 'Name',
        value: JOIN_TYPE_NOT,
      },
      type: makeNamedType(name),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    }
  )

  return {
    kind: 'InputObjectTypeDefinition',
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

export function makeEnumFilterInputObjects(
  obj: ObjectTypeDefinitionNode,
  ctx: TransformerContext,
  supportsConditions: Boolean
): InputObjectTypeDefinitionNode[] {
  return (obj.fields || [])
    .filter((field: FieldDefinitionNode) => {
      const fieldType = ctx.getType(getBaseTypeName(field.type))
      return fieldType && fieldType.kind === Kind.ENUM_TYPE_DEFINITION
    })
    .map((enumField: FieldDefinitionNode) => {
      const typeName = getBaseTypeName(enumField.type)
      const isList = isListType(enumField.type)
      const name = isList
        ? ModelTypeNames.ModelFilterListInputTypeName(typeName, !supportsConditions)
        : ModelTypeNames.ModelScalarFilterInputTypeName(typeName, !supportsConditions)
      const fields = []

      fields.push({
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: {
          kind: 'Name',
          value: 'eq',
        },
        type: isList ? makeListType(makeNamedType(typeName)) : makeNamedType(typeName),
        directives: [],
      })

      fields.push({
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: {
          kind: 'Name',
          value: 'ne',
        },
        type: isList ? makeListType(makeNamedType(typeName)) : makeNamedType(typeName),
        directives: [],
      })

      if (isList) {
        fields.push({
          kind: Kind.INPUT_VALUE_DEFINITION,
          name: {
            kind: 'Name',
            value: 'contains',
          },
          type: makeNamedType(typeName),
          directives: [],
        })

        fields.push({
          kind: Kind.INPUT_VALUE_DEFINITION,
          name: {
            kind: 'Name',
            value: 'notContains',
          },
          type: makeNamedType(typeName),
          directives: [],
        })
      }

      return {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: {
          kind: 'Name',
          value: name,
        },
        fields,
        directives: [],
      } as InputObjectTypeDefinitionNode
    })
}

export function makeModelSortDirectionEnumObject(): EnumTypeDefinitionNode {
  const name = graphqlName('ModelSortDirection')
  return {
    kind: Kind.ENUM_TYPE_DEFINITION,
    name: {
      kind: 'Name',
      value: name,
    },
    values: [
      {
        kind: Kind.ENUM_VALUE_DEFINITION,
        name: { kind: 'Name', value: 'ASC' },
        directives: [],
      },
      {
        kind: Kind.ENUM_VALUE_DEFINITION,
        name: { kind: 'Name', value: 'DESC' },
        directives: [],
      },
    ],
    directives: [],
  }
}

export function makeModelScalarFilterInputObject(
  type: string,
  supportsConditions: Boolean
): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelFilterScalarInputTypeName(type, !supportsConditions)
  const conditions = getScalarConditions(type)
  const fields: InputValueDefinitionNode[] = conditions.map((condition: string) => ({
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: { kind: 'Name' as 'Name', value: condition },
    type: getScalarFilterInputType(condition, type, name),
    // TODO: Service does not support new style descriptions so wait.
    // description: field.description,
    directives: [],
  }))
  let functionInputFields: InputValueDefinitionNode[] = []
  if (supportsConditions) {
    functionInputFields = makeFunctionInputFields(type)
  }
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields: [...fields, ...functionInputFields],
    directives: [],
  }
}

function getScalarFilterInputType(condition: string, type: string, filterInputName: string): TypeNode {
  switch (condition) {
    case 'in':
    case 'notIn':
    case 'between':
      return makeListType(makeNamedType(type))
    case JOIN_TYPE_AND:
    case JOIN_TYPE_OR:
    case JOIN_TYPE_NOT:
      return makeNamedType(filterInputName)
    default:
      return makeNamedType(type)
  }
}

function getScalarConditions(type: string): string[] {
  switch (type) {
    case 'String':
      return STRING_CONDITIONS
    case 'ID':
      return ID_CONDITIONS
    case 'Int':
      return INT_CONDITIONS
    case 'Float':
      return FLOAT_CONDITIONS
    case 'Boolean':
      return BOOLEAN_CONDITIONS
    default:
      throw new Error('Valid types are String, ID, Int, Float, Boolean')
  }
}

function makeSizeInputType(): InputObjectTypeDefinitionNode {
  const name = ModelTypeNames.ModelSizeInputTypeName()
  const fields: InputValueDefinitionNode[] = SIZE_CONDITIONS.map((condition: string) => ({
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: { kind: 'Name' as 'Name', value: condition },
    type: getScalarFilterInputType(condition, 'Int', '' /* unused */),
    // TODO: Service does not support new style descriptions so wait.
    // description: field.description,
    directives: [],
  }))
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    // TODO: Service does not support new style descriptions so wait.
    // description: {
    //     kind: 'StringValue',
    //     value: `Input type for ${obj.name.value} mutations`
    // },
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
  }
}

function getFunctionListForType(typeName: string): Set<string> {
  switch (typeName) {
    case 'String':
      return STRING_FUNCTIONS
    case 'ID':
      return ID_FUNCTIONS
    case 'Int':
      return INT_FUNCTIONS
    case 'Float':
      return FLOAT_FUNCTIONS
    case 'Boolean':
      return BOOLEAN_FUNCTIONS
    default:
      throw new Error('Valid types are String, ID, Int, Float, Boolean')
  }
}

function makeFunctionInputFields(typeName: string): InputValueDefinitionNode[] {
  const functions = getFunctionListForType(typeName)
  const fields = new Array<InputValueDefinitionNode>()

  if (functions.has('attributeExists')) {
    fields.push({
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: 'Name' as 'Name', value: 'attributeExists' },
      type: makeNamedType('Boolean'),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    })
  }

  if (functions.has('attributeType')) {
    fields.push({
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: 'Name' as 'Name', value: 'attributeType' },
      type: makeNamedType(ModelTypeNames.ModelAttributeTypesName()),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    })
  }

  if (functions.has('size')) {
    fields.push({
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: 'Name' as 'Name', value: 'size' },
      type: makeNamedType(ModelTypeNames.ModelSizeInputTypeName()),
      // TODO: Service does not support new style descriptions so wait.
      // description: field.description,
      directives: [],
    })
  }

  return fields
}

export function makeModelConnectionType(typeName: string, isSync: Boolean = false): ObjectTypeExtensionNode {
  const connectionName = ModelTypeNames.ModelConnectionTypeName(typeName)
  let connectionTypeExtension = objectExtension(connectionName)
  connectionTypeExtension = extensionWithFields(connectionTypeExtension, [
    makeField('items', [], makeListType(makeNamedType(typeName))),
  ])
  connectionTypeExtension = extensionWithFields(connectionTypeExtension, [
    makeField('nextToken', [], makeNamedType('String')),
  ])
  if (isSync) {
    connectionTypeExtension = extensionWithFields(connectionTypeExtension, [
      makeField('startedAt', [], makeNamedType('AWSTimestamp')),
    ])
  }
  return connectionTypeExtension
}

export function makeSubscriptionField(
  fieldName: string,
  returnTypeName: string,
  mutations: string[]
): FieldDefinitionNode {
  return makeField(fieldName, [], makeNamedType(returnTypeName), [
    makeDirective('aws_subscribe', [makeArgument('mutations', makeValueNode(mutations))]),
  ])
}

export type SortKeyFieldInfoTypeName = 'Composite' | string

export interface SortKeyFieldInfo {
  // The name of the sort key field.
  fieldName: string
  // The GraphQL type of the sort key field.
  typeName: SortKeyFieldInfoTypeName
  // Name of the model this field is on.
  model?: string
  // The name of the key  that this sortKey is on.
  keyName?: string
}

export function makeModelConnectionField(
  fieldName: string,
  returnTypeName: string,
  sortKeyInfo?: SortKeyFieldInfo,
  directives?: DirectiveNode[]
): FieldDefinitionNode {
  const args = [
    makeInputValueDefinition('filter', makeNamedType(ModelTypeNames.ModelFilterInputTypeName(returnTypeName))),
    makeInputValueDefinition('sortDirection', makeNamedType('ModelSortDirection')),
    makeInputValueDefinition('limit', makeNamedType('Int')),
    makeInputValueDefinition('nextToken', makeNamedType('String')),
  ]
  if (sortKeyInfo) {
    let namedType: NamedTypeNode
    if (sortKeyInfo.typeName === 'Composite') {
      namedType = makeNamedType(
        ModelTypeNames.ModelCompositeKeyConditionInputTypeName(
          sortKeyInfo.model as string,
          toUpper(sortKeyInfo.keyName as string)
        )
      )
    } else {
      namedType = makeNamedType(ModelTypeNames.ModelKeyConditionInputTypeName(sortKeyInfo.typeName))
    }

    args.unshift(makeInputValueDefinition(sortKeyInfo.fieldName, namedType))
  }
  return makeField(fieldName, args, makeNamedType(ModelTypeNames.ModelConnectionTypeName(returnTypeName)), directives)
}

export function makeScalarFilterInputs(supportsConditions: Boolean): InputObjectTypeDefinitionNode[] {
  const inputs = [
    makeModelScalarFilterInputObject('String', supportsConditions),
    makeModelScalarFilterInputObject('ID', supportsConditions),
    makeModelScalarFilterInputObject('Int', supportsConditions),
    makeModelScalarFilterInputObject('Float', supportsConditions),
    makeModelScalarFilterInputObject('Boolean', supportsConditions),
  ]

  if (supportsConditions) {
    inputs.push(makeSizeInputType())
  }

  return inputs
}
