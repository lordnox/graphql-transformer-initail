import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  UnionTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  EnumValueDefinitionNode,
  EnumTypeDefinitionNode,
  Kind,
  DocumentNode,
} from 'graphql'

export const collectDirectiveNames = (doc: DocumentNode) => {
  const dirs = collectDirectives(doc)
  return dirs.map(d => d.name.value)
}

export const collectDirectives = (doc: DocumentNode) => {
  let directives: DirectiveNode[] = []
  for (const def of doc.definitions) {
    switch (def.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
        // Does def node have a @model and no @auth.
        directives = directives.concat(collectObjectDirectives(def))
        break
      case Kind.INTERFACE_TYPE_DEFINITION:
        directives = directives.concat(collectInterfaceDirectives(def))
        break
      case Kind.UNION_TYPE_DEFINITION:
        directives = directives.concat(collectUnionDirectives(def))
        break
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        directives = directives.concat(collectInputObjectDirectives(def))
        break
      case Kind.ENUM_TYPE_DEFINITION:
        directives = directives.concat(collectEnumDirectives(def))
        break
      case Kind.SCALAR_TYPE_DEFINITION:
        directives = directives.concat(collectScalarDirectives(def))
        break
    }
  }
  return directives
}

export const collectDirectivesByTypeNames = (doc: DocumentNode) => {
  const directiveTypes = collectDirectivesByType(doc)
  const types: Record<string, string[]> = {}
  const directives: Set<string> = new Set()
  Object.keys(directiveTypes).forEach(dir => {
    let set: Set<string> = new Set()
    directiveTypes[dir].forEach(({ name: { value } }) => {
      set.add(value)
      directives.add(value)
    })
    types[dir] = Array.from(set)
  })
  return { types, directives: Array.from(directives) }
}
export const collectDirectivesByType = (doc: DocumentNode) => {
  // defined types with directives list
  let types: Record<string, DirectiveNode[]> = {}
  for (const def of doc.definitions) {
    switch (def.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectObjectDirectives(def)]
        break
      case Kind.INTERFACE_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectInterfaceDirectives(def)]
        break
      case Kind.UNION_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectUnionDirectives(def)]
        break
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectInputObjectDirectives(def)]
        break
      case Kind.ENUM_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectEnumDirectives(def)]
        break
      case Kind.SCALAR_TYPE_DEFINITION:
        types[def.name.value] = [...(types[def.name.value] || []), ...collectScalarDirectives(def)]
        break
    }
  }
  return types
}

export const collectObjectDirectives = (node: ObjectTypeDefinitionNode) => {
  let dirs: DirectiveNode[] = []
  for (const field of node.fields || []) {
    const fieldDirs = collectFieldDirectives(field)
    dirs = dirs.concat(fieldDirs)
  }
  return dirs.concat(node.directives as DirectiveNode[])
}

export const collectInterfaceDirectives = (node: InterfaceTypeDefinitionNode) => {
  let dirs: DirectiveNode[] = []
  for (const field of node.fields || []) {
    const fieldDirs = collectFieldDirectives(field)
    dirs = dirs.concat(fieldDirs)
  }
  return dirs.concat(node.directives as DirectiveNode[])
}

export const collectFieldDirectives = (node: FieldDefinitionNode) => {
  let dirs: DirectiveNode[] = []
  for (const arg of node.arguments || []) {
    const argDirs = collectArgumentDirectives(arg)
    dirs = dirs.concat(argDirs)
  }
  return dirs.concat(node.directives as DirectiveNode[])
}

export const collectArgumentDirectives = (node: InputValueDefinitionNode) => [...(node.directives || [])]

export const collectUnionDirectives = (node: UnionTypeDefinitionNode) => [...(node.directives || [])]

export const collectScalarDirectives = (node: ScalarTypeDefinitionNode) => [...(node.directives || [])]

export const collectInputObjectDirectives = (node: InputObjectTypeDefinitionNode) => {
  let dirs: DirectiveNode[] = []
  for (const field of node.fields || []) {
    const fieldDirs = collectArgumentDirectives(field)
    dirs = dirs.concat(fieldDirs)
  }
  return dirs.concat(node.directives as DirectiveNode[])
}

export const collectEnumDirectives = (node: EnumTypeDefinitionNode) => {
  let dirs: DirectiveNode[] = []
  for (const val of node.values || []) {
    const valDirs = collectEnumValueDirectives(val)
    dirs = dirs.concat(valDirs)
  }
  return dirs.concat(node.directives as DirectiveNode[])
}

export const collectEnumValueDirectives = (node: EnumValueDefinitionNode) => [...(node.directives || [])]
