import {
  ObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  FieldDefinitionNode,
  TypeNode,
  SchemaDefinitionNode,
  OperationTypeNode,
  OperationTypeDefinitionNode,
  ObjectTypeExtensionNode,
  NamedTypeNode,
  Kind,
  NonNullTypeNode,
  ListTypeNode,
  valueFromASTUntyped,
  ArgumentNode,
  DirectiveNode,
  EnumTypeDefinitionNode,
  ValueNode,
  InputObjectTypeDefinitionNode,
} from 'graphql'
import { INPUT_TYPE_NAME_WHERE } from './transformer-model/directive-transformer'

type ScalarMap = {
  [k: string]: 'String' | 'Int' | 'Float' | 'Boolean' | 'ID'
}
export const DEFAULT_SCALARS: ScalarMap = {
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Boolean: 'Boolean',
  ID: 'ID',
}

export function attributeTypeFromScalar(scalar: TypeNode) {
  const baseType = getBaseTypeName(scalar)
  const baseScalar = DEFAULT_SCALARS[baseType]
  if (!baseScalar) {
    throw new Error(`Expected scalar and got ${baseType}`)
  }
  switch (baseScalar) {
    case 'String':
    case 'ID':
      return 'S'
    case 'Int':
    case 'Float':
      return 'N'
    case 'Boolean':
      throw new Error(`Boolean values cannot be used as sort keys.`)
    default:
      throw new Error(`There is no valid  attribute type for scalar ${baseType}`)
  }
}

export const isScalar = (type: TypeNode) => Boolean(DEFAULT_SCALARS[getBaseType(type).name.value])

export const isScalarOrEnum = (type: TypeNode, enums: EnumTypeDefinitionNode[]): boolean => {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return isScalarOrEnum(type.type, enums)
  } else if (type.kind === Kind.LIST_TYPE) {
    return isScalarOrEnum(type.type, enums)
  } else {
    for (const e of enums) {
      if (e.name.value === type.name.value) {
        return true
      }
    }
    return Boolean(DEFAULT_SCALARS[type.name.value])
  }
}

export const getBaseType = (type: TypeNode): NamedTypeNode => {
  // if it is a null type, strip it and try again
  if (type.kind === Kind.NON_NULL_TYPE) return getBaseType(type.type)
  // if it is a list type, strip it and try again
  if (type.kind === Kind.LIST_TYPE) return getBaseType(type.type)
  // else we do have a NamedTypeNode
  return type
}

export const getBaseTypeName = (type: TypeNode) => getBaseType(type).name.value

export const isListType = (type: TypeNode): boolean =>
  isNonNullType(type) ? isListType(type.type) : type.kind === Kind.LIST_TYPE

export const isNonNullType = (type: TypeNode): type is NonNullTypeNode => type.kind === Kind.NON_NULL_TYPE

export function getDirectiveArgument(directive: DirectiveNode, arg: string, dflt?: any) {
  const argument = directive.arguments?.find(a => a.name.value === arg)
  return argument ? valueFromASTUntyped(argument.value) : dflt
}

export const unwrapNonNull = (type: TypeNode): NamedTypeNode | ListTypeNode =>
  isNonNullType(type) ? unwrapNonNull(type.type) : type

export const wrapNonNull = (type: TypeNode) => (isNonNullType(type) ? type : makeNonNullType(type))

export function makeOperationType(operation: OperationTypeNode, type: string): OperationTypeDefinitionNode {
  return {
    kind: 'OperationTypeDefinition',
    operation,
    type: {
      kind: 'NamedType',
      name: {
        kind: Kind.NAME,
        value: type,
      },
    },
  }
}

export function makeSchema(operationTypes: OperationTypeDefinitionNode[]): SchemaDefinitionNode {
  return {
    kind: Kind.SCHEMA_DEFINITION,
    operationTypes,
    directives: [],
  }
}

export function objectExtension(name: string, fields: FieldDefinitionNode[] = []): ObjectTypeExtensionNode {
  return {
    kind: Kind.OBJECT_TYPE_EXTENSION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    fields,
    directives: [],
    interfaces: [],
  }
}

export function extensionWithFields(
  object: ObjectTypeExtensionNode,
  fields: FieldDefinitionNode[]
): ObjectTypeExtensionNode {
  return {
    ...object,
    fields: [...(object.fields || []), ...fields],
  }
}

export function extensionWithDirectives(object: ObjectTypeExtensionNode, directives: DirectiveNode[]) {
  if (directives && directives.length > 0) {
    const newDirectives = []

    for (const directive of directives)
      if (!object.directives?.find(d => d.name.value === directive.name.value)) newDirectives.push(directive)

    if (newDirectives.length > 0) {
      return {
        ...object,
        directives: [...(object.directives || []), ...newDirectives],
      }
    }
  }

  return object
}

export function extendFieldWithDirectives(field: FieldDefinitionNode, directives: DirectiveNode[]) {
  if (directives && directives.length > 0) {
    const newDirectives = []

    for (const directive of directives)
      if (!field.directives?.find(d => d.name.value === directive.name.value)) newDirectives.push(directive)

    if (newDirectives.length > 0) {
      return {
        ...field,
        directives: [...(field.directives || []), ...newDirectives],
      }
    }
  }

  return field
}

export function makeInputObjectDefinition(
  name: string,
  inputs: InputValueDefinitionNode[]
): InputObjectTypeDefinitionNode {
  return {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    fields: inputs,
    directives: [],
  }
}

export function makeObjectDefinition(name: string, inputs: FieldDefinitionNode[] = []): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    fields: inputs,
    directives: [],
  }
}

export function makeField(
  name: string,
  args: InputValueDefinitionNode[],
  type: TypeNode,
  directives: DirectiveNode[] = []
): FieldDefinitionNode {
  return {
    kind: Kind.FIELD_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    arguments: args,
    type,
    directives,
  }
}

export function makeDirective(name: string, args: ArgumentNode[]): DirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    arguments: args,
  }
}

export function makeArgument(name: string, value: ValueNode): ArgumentNode {
  return {
    kind: Kind.ARGUMENT,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    value,
  }
}

export function makeValueNode(value: any): ValueNode {
  if (typeof value === 'string') {
    return { kind: Kind.STRING, value: value }
  } else if (Number.isInteger(value)) {
    return { kind: Kind.INT, value: value }
  } else if (typeof value === 'number') {
    return { kind: Kind.FLOAT, value: String(value) }
  } else if (typeof value === 'boolean') {
    return { kind: Kind.BOOLEAN, value: value }
  } else if (value === null) {
    return { kind: Kind.NULL }
  } else if (Array.isArray(value)) {
    return {
      kind: Kind.LIST,
      values: value.map(v => makeValueNode(v)),
    }
  } else if (typeof value === 'object') {
    return {
      kind: Kind.OBJECT,
      fields: Object.keys(value).map((key: string) => {
        const keyValNode = makeValueNode(value[key])
        return {
          kind: Kind.OBJECT_FIELD,
          name: { kind: Kind.NAME, value: key },
          value: keyValNode,
        }
      }),
    }
  }
  throw new Error('Could not create ValueNode!')
}

export function makeInputValueDefinition(name: string, type: TypeNode): InputValueDefinitionNode {
  return {
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    type,
    directives: [],
  }
}

export function makeNamedType(name: string): NamedTypeNode {
  return {
    kind: Kind.NAMED_TYPE,
    name: {
      kind: Kind.NAME,
      value: name,
    },
  }
}

export function makeNonNullType(type: NamedTypeNode | ListTypeNode): NonNullTypeNode {
  return {
    kind: Kind.NON_NULL_TYPE,
    type,
  }
}

export function makeListType(type: TypeNode): TypeNode {
  return {
    kind: Kind.LIST_TYPE,
    type,
  }
}

export function withNamedNodeNamed(t: TypeNode, n: string): TypeNode {
  switch (t.kind) {
    case Kind.NON_NULL_TYPE:
      return {
        ...t,
        type: withNamedNodeNamed(t.type, n),
      } as TypeNode
    case Kind.LIST_TYPE:
      return {
        ...t,
        type: withNamedNodeNamed(t.type, n),
      } as TypeNode
    case Kind.NAMED_TYPE:
      return {
        ...t,
        name: {
          kind: Kind.NAME,
          value: n,
        },
      }
  }
}

export const singularity = (val: string) => {
  const trimmed = val.trim()
  if (!trimmed || trimmed[trimmed.length - 1] !== 's') return trimmed
  return trimmed.substr(0, -1)
}

export const plurality = (val: string) => {
  if (!val.trim()) {
    return ''
  }
  return val.concat('s')
}

export const graphqlName = (val: string) => {
  if (!val.trim()) {
    return ''
  }
  const cleaned = val.replace(/^[^_A-Za-z]+|[^_0-9A-Za-z]/g, '')
  return cleaned
}

export function toUpper(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export class ModelTypeNames {
  static ModelFilterInputTypeName = (name: string) => `Model${DEFAULT_SCALARS[name] || name}FilterInput`
  static ModelFilterScalarInputTypeName = (name: string, includeFilter: Boolean) =>
    `Model${DEFAULT_SCALARS[name] || name}${includeFilter ? 'Filter' : ''}Input`
  static ModelConditionInputTypeName = (name: string) => `Model${DEFAULT_SCALARS[name] || name}ConditionInput`
  static ModelKeyConditionInputTypeName = (name: string) => `Model${DEFAULT_SCALARS[name] || name}KeyConditionInput`
  static ModelCompositeKeyConditionInputTypeName = (modelName: string, keyName: string) =>
    `Model${modelName}${keyName}CompositeKeyConditionInput`
  static ModelCompositeKeyInputTypeName = (modelName: string, keyName: string) =>
    `Model${modelName}${keyName}CompositeKeyInput`
  static ModelFilterListInputTypeName = (name: string, includeFilter: Boolean) =>
    `Model${DEFAULT_SCALARS[name] || name}List${includeFilter ? 'Filter' : ''}Input`

  static ModelScalarFilterInputTypeName = (name: string, includeFilter: Boolean) =>
    `Model${DEFAULT_SCALARS[name] || name}${includeFilter ? 'Filter' : ''}Input`
  static ModelConnectionTypeName = (typeName: string) => `Model${typeName}Connection`
  static ModelDeleteInputObjectName = (typeName: string) => graphqlName('Delete' + toUpper(typeName) + 'Input')
  static ModelUpdateInputObjectName = (typeName: string) => graphqlName('Update' + toUpper(typeName) + 'Input')
  static ModelCreateInputObjectName = (typeName: string) => graphqlName(`Create` + toUpper(typeName) + 'Input')
  static ModelOnCreateSubscriptionName = (typeName: string) => graphqlName(`onCreate` + toUpper(typeName))
  static ModelOnUpdateSubscriptionName = (typeName: string) => graphqlName(`onUpdate` + toUpper(typeName))
  static ModelOnDeleteSubscriptionName = (typeName: string) => graphqlName(`onDelete` + toUpper(typeName))
  static ModelAttributeTypesName = () => `ModelAttributeTypes`
  static ModelSizeInputTypeName = () => `ModelSizeInput`
  static NonModelInputObjectName = (typeName: string) => graphqlName(toUpper(typeName) + 'Input')
}

export class ResolverTypeNames {
  static CreateResolverResourceID = (typeName: string) => `Create${typeName}Resolver`
  static UpdateResolverResourceID = (typeName: string) => `Update${typeName}Resolver`
  static DeleteResolverResourceID = (typeName: string) => `Delete${typeName}Resolver`
  static GetResolverResourceID = (typeName: string) => `Get${typeName}Resolver`
  static ListResolverResourceID = (typeName: string) => `List${typeName}Resolver`
  static ResolverResourceID = (typeName: string, fieldName: string) => `${typeName}${fieldName}Resolver`
}

export class ResolverNames {
  static CreateResolver = (typeName: string) => `create${graphqlName(singularity(typeName))}`
  static UpdateResolver = (typeName: string) => `update${graphqlName(singularity(typeName))}`
  static DeleteResolver = (typeName: string) => `delete${graphqlName(singularity(typeName))}`
  static GetResolver = (typeName: string) => `get${graphqlName(singularity(typeName))}`
  static ListResolver = (typeName: string) => `list${graphqlName(plurality(typeName))}`
}

export function makeConnectionField(fieldName: string, returnTypeName: string, args: InputValueDefinitionNode[] = []) {
  return makeField(
    fieldName,
    [
      ...args,
      makeInputValueDefinition(
        INPUT_TYPE_NAME_WHERE,
        makeNamedType(ModelTypeNames.ModelFilterInputTypeName(returnTypeName))
      ),
      makeInputValueDefinition('limit', makeNamedType('Int')),
      // makeInputValueDefinition('nextToken', makeNamedType('String')),
    ],
    makeNamedType(ModelTypeNames.ModelConnectionTypeName(returnTypeName))
  )
}
