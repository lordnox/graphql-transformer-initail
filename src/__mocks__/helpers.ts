import {
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  ObjectTypeDefinitionNode,
  FieldDefinitionNode,
  DocumentNode,
  DefinitionNode,
  Kind,
  TypeNode,
} from 'graphql'

export const expectFieldsOnInputType = (type: InputObjectTypeDefinitionNode, fields: string[], not = false) => {
  for (const fieldName of fields) {
    const foundField = type.fields?.find((f: InputValueDefinitionNode) => f.name.value === fieldName)
    if (not) expect(foundField).not.toBeDefined()
    else expect(foundField).toBeDefined()
  }
}

export const expectFields = (type: ObjectTypeDefinitionNode, fields: string[], not = false) => {
  for (const fieldName of fields) {
    const foundField = type.fields?.find((f: FieldDefinitionNode) => f.name.value === fieldName)
    if (not) expect(foundField).not.toBeDefined()
    else expect(foundField).toBeDefined()
  }
}

export const expectFieldsOnTypeGenerator = (doc: DocumentNode) => (name: string, fields: string[], not = false) => {
  const objectType = getObjectType(doc, name)
  if (objectType) return expectFields(objectType, fields, not)
  const inputType = getInputType(doc, name)
  if (inputType) return expectFieldsOnInputType(inputType, fields, not)
  throw new Error(`'${name}' could not be found in the document`)
}

export const getFieldOnInputType = (type: InputObjectTypeDefinitionNode, field: string) =>
  type.fields?.find(node => node.name.value === field)

export const getFieldOnObjectType = (type: ObjectTypeDefinitionNode, field: string) =>
  type.fields?.find(node => node.name.value === field)

export const doNotExpectFields = (type: ObjectTypeDefinitionNode, fields: string[]) => {
  for (const fieldName of fields) {
    expect(type.fields?.find(node => node.name.value === fieldName)).toBeUndefined()
  }
}

export const getObjectType = (doc: DocumentNode, type: string): ObjectTypeDefinitionNode | undefined =>
  doc.definitions.find((def: DefinitionNode) => def.kind === Kind.OBJECT_TYPE_DEFINITION && def.name.value === type) as
    | ObjectTypeDefinitionNode
    | undefined

export const getInputType = (doc: DocumentNode, type: string) =>
  doc.definitions.find(
    (def: DefinitionNode) => def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && def.name.value === type
  ) as InputObjectTypeDefinitionNode | undefined

export const verifyInputCount = (doc: DocumentNode, type: string, count: number) =>
  doc.definitions.filter(def => def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && def.name.value === type).length ==
  count

export const verifyMatchingTypes = (t1: TypeNode, t2: TypeNode): boolean => {
  if (t1.kind !== t2.kind) return false

  if (t1.kind !== Kind.NAMED_TYPE && t2.kind !== Kind.NAMED_TYPE) {
    return verifyMatchingTypes(t1.type, t2.type)
  } else {
    return false
  }
}
