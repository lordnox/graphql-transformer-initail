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

type ScalarMap = {
  [k: string]: 'String' | 'Int' | 'Float' | 'Boolean' | 'ID'
}
export const STANDARD_SCALARS: ScalarMap = {
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Boolean: 'Boolean',
  ID: 'ID',
}

const OTHER_SCALARS: ScalarMap = {
  BigInt: 'Int',
  Double: 'Float',
}

export const APPSYNC_DEFINED_SCALARS: ScalarMap = {
  AWSDate: 'String',
  AWSTime: 'String',
  AWSDateTime: 'String',
  AWSTimestamp: 'Int',
  AWSEmail: 'String',
  AWSJSON: 'String',
  AWSURL: 'String',
  AWSPhone: 'String',
  AWSIPAddress: 'String',
}

export const DEFAULT_SCALARS: ScalarMap = {
  ...STANDARD_SCALARS,
  ...OTHER_SCALARS,
  ...APPSYNC_DEFINED_SCALARS,
}

export const NUMERIC_SCALARS: { [k: string]: boolean } = {
  BigInt: true,
  Int: true,
  Float: true,
  Double: true,
  AWSTimestamp: true,
}

export const MAP_SCALARS: { [k: string]: boolean } = {
  AWSJSON: true,
}

export function attributeTypeFromScalar(scalar: TypeNode) {
  const baseType = getBaseType(scalar)
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

export function isScalar(type: TypeNode): boolean {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return isScalar(type.type)
  } else if (type.kind === Kind.LIST_TYPE) {
    return isScalar(type.type)
  } else {
    return Boolean(DEFAULT_SCALARS[type.name.value])
  }
}

export function isScalarOrEnum(type: TypeNode, enums: EnumTypeDefinitionNode[]): boolean {
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

export function getBaseType(type: TypeNode): string {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return getBaseType(type.type)
  } else if (type.kind === Kind.LIST_TYPE) {
    return getBaseType(type.type)
  } else {
    return type.name.value
  }
}

export function isListType(type: TypeNode): boolean {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return isListType(type.type)
  } else if (type.kind === Kind.LIST_TYPE) {
    return true
  } else {
    return false
  }
}

export function isNonNullType(type: TypeNode): boolean {
  return type.kind === Kind.NON_NULL_TYPE
}

export function getDirectiveArgument(directive: DirectiveNode, arg: string, dflt?: any) {
  const argument = directive.arguments?.find(a => a.name.value === arg)
  return argument ? valueFromASTUntyped(argument.value) : dflt
}

export function unwrapNonNull(type: TypeNode): NamedTypeNode | ListTypeNode {
  if (type.kind === 'NonNullType') {
    return unwrapNonNull(type.type)
  }
  return type
}

export function wrapNonNull(type: TypeNode) {
  if (type.kind !== 'NonNullType') {
    return makeNonNullType(type)
  }
  return type
}

export function makeOperationType(operation: OperationTypeNode, type: string): OperationTypeDefinitionNode {
  return {
    kind: 'OperationTypeDefinition',
    operation,
    type: {
      kind: 'NamedType',
      name: {
        kind: 'Name',
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

export function blankObject(name: string): ObjectTypeDefinitionNode {
  return {
    kind: 'ObjectTypeDefinition',
    name: {
      kind: 'Name',
      value: name,
    },
    fields: [],
    directives: [],
    interfaces: [],
  }
}

export function objectExtension(name: string, fields: FieldDefinitionNode[] = []): ObjectTypeExtensionNode {
  return {
    kind: Kind.OBJECT_TYPE_EXTENSION,
    name: {
      kind: 'Name',
      value: name,
    },
    fields,
    directives: [],
    interfaces: [],
  }
}

export function blankObjectExtension(name: string): ObjectTypeExtensionNode {
  return {
    kind: Kind.OBJECT_TYPE_EXTENSION,
    name: {
      kind: 'Name',
      value: name,
    },
    fields: [],
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

export function extensionWithDirectives(
  object: ObjectTypeExtensionNode,
  directives: DirectiveNode[]
): ObjectTypeExtensionNode {
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

export function extendFieldWithDirectives(
  field: FieldDefinitionNode,
  directives: DirectiveNode[]
): FieldDefinitionNode {
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
    kind: 'InputObjectTypeDefinition',
    name: {
      kind: 'Name',
      value: name,
    },
    fields: inputs,
    directives: [],
  }
}

export function makeObjectDefinition(name: string, inputs: FieldDefinitionNode[]): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: {
      kind: 'Name',
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
      kind: 'Name',
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
      kind: 'Name',
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
      kind: 'Name',
      value: name,
    },
    type,
    directives: [],
  }
}

export function makeNamedType(name: string): NamedTypeNode {
  return {
    kind: 'NamedType',
    name: {
      kind: 'Name',
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
    kind: 'ListType',
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

export function plurality(val: string): string {
  if (!val.trim()) {
    return ''
  }
  return val.concat('s')
}

export function graphqlName(val: string): string {
  if (!val.trim()) {
    return ''
  }
  const cleaned = val.replace(/^[^_A-Za-z]+|[^_0-9A-Za-z]/g, '')
  return cleaned
}

export function simplifyName(val: string): string {
  if (!val.trim()) {
    return ''
  }
  return toPascalCase(
    val
      .replace(/-?_?\${[^}]*}/g, '')
      .replace(/^[^_A-Za-z]+|[^_0-9A-Za-z]/g, '|')
      .split('|')
  )
}

export function toUpper(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function toCamelCase(words: string[]): string {
  const formatted = words.map((w, i) =>
    i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)
  )
  return formatted.join('')
}

export function toPascalCase(words: string[]): string {
  const formatted = words.map((w, i) => w.charAt(0).toUpperCase() + w.slice(1))
  return formatted.join('')
}

export class ModelResourceIDs {
  static ModelTableResourceID = (typeName: string) => `${typeName}Table`
  static ModelTableStreamArn = (typeName: string) => `${typeName}TableStreamArn`
  static ModelTableDataSourceID = (typeName: string) => `${typeName}DataSource`
  static ModelTableIAMRoleID = (typeName: string) => `${typeName}IAMRole`
  static ModelFilterInputTypeName(name: string) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}FilterInput`
    }
    return `Model${name}FilterInput`
  }
  static ModelFilterScalarInputTypeName(name: string, includeFilter: Boolean) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}${includeFilter ? 'Filter' : ''}Input`
    }
    return `Model${name}${includeFilter ? 'Filter' : ''}Input`
  }
  static ModelConditionInputTypeName(name: string) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}ConditionInput`
    }
    return `Model${name}ConditionInput`
  }
  static ModelKeyConditionInputTypeName(name: string) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}KeyConditionInput`
    }
    return `Model${name}KeyConditionInput`
  }
  static ModelCompositeKeyArgumentName = (keyFieldNames: string[]) =>
    toCamelCase(keyFieldNames.map(n => graphqlName(n)))
  static ModelCompositeKeySeparator = () => '#'
  static ModelCompositeAttributeName = (keyFieldNames: string[]) =>
    keyFieldNames.join(ModelResourceIDs.ModelCompositeKeySeparator())
  static ModelCompositeKeyConditionInputTypeName = (modelName: string, keyName: string) =>
    `Model${modelName}${keyName}CompositeKeyConditionInput`
  static ModelCompositeKeyInputTypeName = (modelName: string, keyName: string) =>
    `Model${modelName}${keyName}CompositeKeyInput`
  static ModelFilterListInputTypeName(name: string, includeFilter: Boolean) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}List${includeFilter ? 'Filter' : ''}Input`
    }
    return `Model${name}List${includeFilter ? 'Filter' : ''}Input`
  }

  static ModelScalarFilterInputTypeName(name: string, includeFilter: Boolean) {
    const nameOverride = DEFAULT_SCALARS[name]
    if (nameOverride) {
      return `Model${nameOverride}${includeFilter ? 'Filter' : ''}Input`
    }
    return `Model${name}${includeFilter ? 'Filter' : ''}Input`
  }
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
  static UrlParamsInputObjectName = (typeName: string, fieldName: string) =>
    graphqlName(toUpper(typeName) + toUpper(fieldName) + 'ParamsInput')
  static HttpQueryInputObjectName = (typeName: string, fieldName: string) =>
    graphqlName(toUpper(typeName) + toUpper(fieldName) + 'QueryInput')
  static HttpBodyInputObjectName = (typeName: string, fieldName: string) =>
    graphqlName(toUpper(typeName) + toUpper(fieldName) + 'BodyInput')
}

export class ResolverResourceIDs {
  static CreateResolverResourceID = (typeName: string) => `Create${typeName}Resolver`
  static UpdateResolverResourceID = (typeName: string) => `Update${typeName}Resolver`
  static DeleteResolverResourceID = (typeName: string) => `Delete${typeName}Resolver`
  static GetResolverResourceID = (typeName: string) => `Get${typeName}Resolver`
  static ListResolverResourceID = (typeName: string) => `List${typeName}Resolver`
  static ResolverResourceID = (typeName: string, fieldName: string) => `${typeName}${fieldName}Resolver`
}

export function makeConnectionField(fieldName: string, returnTypeName: string, args: InputValueDefinitionNode[] = []) {
  return makeField(
    fieldName,
    [
      ...args,
      makeInputValueDefinition('filter', makeNamedType(ModelResourceIDs.ModelFilterInputTypeName(returnTypeName))),
      makeInputValueDefinition('limit', makeNamedType('Int')),
      makeInputValueDefinition('nextToken', makeNamedType('String')),
    ],
    makeNamedType(ModelResourceIDs.ModelConnectionTypeName(returnTypeName))
  )
}
