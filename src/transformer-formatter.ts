import { TransformerContext } from './transformer-core'
import { makeOperationType, makeSchema } from './transformer-common'
import { ObjectTypeDefinitionNode, print } from 'graphql'
import { stripDirectives } from './stripDirectives'
import { RESOLVER } from './resources'

export class TransformFormatter {
  /**
   * Formats the ctx into a set of deployment resources.
   *
   * At this point, all resources that were created by scanning/reading
   * GraphQL schema and cloudformation template files have been collected into
   * a singular ctx.template object. Doing this allows the CLI to perform
   * sophisticated mapping, de-duplication, stack references with correct
   * import/export values, and other nice cleanup routines. Once this is
   * complete, the singular object can be split into the necessary stacks
   * (splitStack) for each GraphQL resource.
   *
   * @param ctx the transformer context.
   * Returns all the deployment resources for the transformation.
   */
  public format(ctx: TransformerContext) {
    const resolversFunctionsAndSchema = this.collectResolversFunctionsAndSchema(ctx)
    return {
      ...resolversFunctionsAndSchema,
    }
  }

  /**
   * Schema helper to pull resources from the context and output the final schema resource.
   */
  private buildSchema(ctx: TransformerContext): string {
    const mutationNode: ObjectTypeDefinitionNode | undefined = ctx.getMutation()
    const queryNode: ObjectTypeDefinitionNode | undefined = ctx.getQuery()
    const subscriptionNode: ObjectTypeDefinitionNode | undefined = ctx.getSubscription()
    let includeMutation = true
    let includeQuery = true
    let includeSubscription = true
    if (!mutationNode || mutationNode.fields?.length === 0) {
      delete ctx.nodeMap.Mutation
      includeMutation = false
    }
    if (!queryNode || queryNode.fields?.length === 0) {
      delete ctx.nodeMap.Query
      includeQuery = false
    }
    if (!subscriptionNode || subscriptionNode.fields?.length === 0) {
      delete ctx.nodeMap.Subscription
      includeSubscription = false
    }
    const ops = []
    if (includeQuery) {
      ops.push(makeOperationType('query', (queryNode as ObjectTypeDefinitionNode).name.value))
    }
    if (includeMutation) {
      ops.push(makeOperationType('mutation', (mutationNode as ObjectTypeDefinitionNode).name.value))
    }
    if (includeSubscription) {
      ops.push(makeOperationType('subscription', (subscriptionNode as ObjectTypeDefinitionNode).name.value))
    }
    ctx.schema = makeSchema(ops)
    return print(
      stripDirectives({
        kind: 'Document',
        definitions: Object.keys(ctx.nodeMap).map((k: string) => ctx.getType(k)),
      })
    )
  }

  /**
   * Builds the schema and creates the schema record to pull from S3.
   * Returns the schema SDL text as a string.
   */
  private buildAndSetSchema = (ctx: TransformerContext) => this.buildSchema(ctx)

  private collectResolversFunctionsAndSchema(ctx: TransformerContext) {
    let resolverMap: Record<string, any> = {}

    const resources = ctx.resources
    console.log(resources)
    for (const resourceName of Object.keys(resources)) {
      const resource = resources[resourceName]
      if (resource.type !== RESOLVER) break
      if (!resource.resolver) throw new Error(`Missing resolver for ${resourceName}`)
      const { fieldName, queryTypeName } = resource
      const mapEntry = resolverMap[queryTypeName] || {}
      mapEntry[fieldName] = resource.resolver
      resolverMap = { ...resolverMap, [queryTypeName]: mapEntry }
    }

    const typeDefs = this.buildAndSetSchema(ctx)
    return {
      resolvers: resolverMap,
      typeDefs,
    }
  }
}
