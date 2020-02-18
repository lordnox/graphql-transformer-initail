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
  DefinitionNode,
} from 'graphql'

const createStrip = (excepted: (node: DirectiveNode) => boolean) => {
  const simpleDirectivesFilter = <
    Type extends InputValueDefinitionNode | UnionTypeDefinitionNode | ScalarTypeDefinitionNode | EnumValueDefinitionNode
  >(
    node: Type
  ): Type => ({
    ...node,
    directives: node.directives?.filter(excepted),
  })
  const fieldDirectivesFilter = <Type extends ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode>(
    node: Type
  ): Type => ({
    ...node,
    fields: node.fields ? node.fields.map(strip.fieldDirectives) : node.fields,
    directives: node.directives?.filter(excepted),
  })
  const strip = {
    objectDirectives: fieldDirectivesFilter,
    interfaceDirectives: fieldDirectivesFilter,

    fieldDirectives: (node: FieldDefinitionNode): FieldDefinitionNode => ({
      ...node,
      arguments: node.arguments ? node.arguments.map(strip.argumentDirectives) : node.arguments,
      directives: node.directives?.filter(excepted),
    }),

    argumentDirectives: simpleDirectivesFilter,
    unionDirectives: simpleDirectivesFilter,
    scalarDirectives: simpleDirectivesFilter,
    enumValueDirectives: simpleDirectivesFilter,

    inputObjectDirectives: (node: InputObjectTypeDefinitionNode): InputObjectTypeDefinitionNode => ({
      ...node,
      fields: node.fields ? node.fields.map(strip.argumentDirectives) : node.fields,
      directives: node.directives?.filter(excepted),
    }),

    enumDirectives: (node: EnumTypeDefinitionNode): EnumTypeDefinitionNode => ({
      ...node,
      values: node.values ? node.values.map(strip.enumValueDirectives) : node.values,
      directives: node.directives?.filter(excepted),
    }),
  }
  return strip
}

export function stripDirectives(doc: DocumentNode, except: string[] = []): DocumentNode {
  const strip = createStrip((dir: DirectiveNode) => Boolean(except.find(f => dir.name.value === f)))
  const definitions: DefinitionNode[] = []
  for (const def of doc.definitions) {
    switch (def.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
        definitions.push(strip.objectDirectives(def))
        break
      case Kind.INTERFACE_TYPE_DEFINITION:
        definitions.push(strip.interfaceDirectives(def))
        break
      case Kind.UNION_TYPE_DEFINITION:
        definitions.push(strip.unionDirectives(def))
        break
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        definitions.push(strip.inputObjectDirectives(def))
        break
      case Kind.ENUM_TYPE_DEFINITION:
        definitions.push(strip.enumDirectives(def))
        break
      case Kind.SCALAR_TYPE_DEFINITION:
        definitions.push(strip.scalarDirectives(def))
        break
    }
  }

  return {
    kind: Kind.DOCUMENT,
    definitions,
  }
}
