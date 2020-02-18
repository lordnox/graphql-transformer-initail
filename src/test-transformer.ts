import { Transformer } from './transformer'

import { ResourceFactory, createResolver } from './resources'
import { gql } from './utils'
import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  SchemaDefinitionNode,
  FieldDefinitionNode,
  InterfaceTypeDefinitionNode,
  createLexer,
  Kind,
} from 'graphql'
import { TransformerContext } from './transformer-core'
import { getDirectiveArgument } from './transformer-common'
import { InvalidDirectiveError } from './errors'
import { IFieldResolver } from 'graphql-tools'

export class TestConfigTransformer extends Transformer {
  resources: ResourceFactory

  constructor() {
    super(
      'TestConfigTransformer',
      gql`
        directive @testConfig(value: String) on SCHEMA
      `
    )
  }

  public schema = (def: SchemaDefinitionNode, directive: DirectiveNode, ctx: TransformerContext) => {
    const value = getDirectiveArgument(directive, 'value', undefined)
    ctx.setResource('config:test', {
      type: 'config:var',
      value,
    })
    return null
  }
}

export class TestTransformer extends Transformer {
  resources: ResourceFactory

  constructor() {
    super(
      'TestTransformer',
      gql`
        directive @test on FIELD_DEFINITION
      `
    )
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    if (parent.kind === Kind.INTERFACE_TYPE_DEFINITION) {
      throw new InvalidDirectiveError(
        `The @test directive cannot be placed on an interface's field. See ${parent.name.value}${definition.name.value}`
      )
    }
    const val = ctx.getResource('config:test')?.value || 'Hello??'

    const typeName = parent.name.value
    const fieldName = definition.name.value
    const resourceName = `${typeName}.${fieldName}`
    const resource = ctx.getResource(resourceName)

    if (!resource)
      return ctx.setResource(resourceName, createResolver({ fieldName, queryTypeName: typeName, resolver: () => val }))
    const mergedResolver: IFieldResolver<any, any> = async (source, args, context, info) => {
      const result = await resource.resolver(source, args, context, info)
      return `${result}${val}`
    }

    ctx.setResource(resourceName, createResolver({ fieldName, queryTypeName: typeName, resolver: mergedResolver }))
  }
}
