import { DirectiveNode, ObjectTypeDefinitionNode } from 'graphql'
import { TransformerContext } from '../transformer-core'
import { Transformer } from '../transformer'
import { getNonModelObjectArray, makeNonModelInputObject } from '../definitions'
import { ResourceFactory } from '../resources'
import { getDirectiveArguments, gql } from '../utils'
import { IFieldResolver } from 'graphql-tools'
import {
  typeExist,
  createQueries,
  createMutations,
  createSubscriptions,
  updateMutationConditionInput,
  CreateFunctionArgs,
} from './directive-transformer'

type Resolver<Context> = IFieldResolver<any, Context>

export interface ModelService<Context, Source = any> {
  resolvers?: Partial<Record<'get' | 'list' | 'update' | 'create' | 'delete', Resolver<Context>>>
  conditions?: Record<string, Resolver<Context>>
}

export interface ModelTransformerOptions<Context> {
  models: Record<string, ModelService<Context>>
}

/**
 * The @model transformer.
 */

export class ModelTransformer<Context> extends Transformer {
  resources?: ResourceFactory
  opts: ModelTransformerOptions<Context>

  constructor(opts: ModelTransformerOptions<Context>) {
    super(
      'ModelTransformer',
      gql`
        directive @model(
          modelName: String
          queries: ModelQueryMap
          mutations: ModelMutationMap
          subscriptions: ModelSubscriptionMap
          # Condition needs to be found in the models resolver
          condition: String
        ) on OBJECT

        input ModelMutationMap {
          create: String
          update: String
          delete: String
        }

        input ModelQueryMap {
          get: String
          list: String
        }

        input ModelSubscriptionMap {
          onCreate: [String]
          onUpdate: [String]
          onDelete: [String]
          level: ModelSubscriptionLevel
        }

        enum ModelSubscriptionLevel {
          off
          public
          on
        }
      `
    )
    this.opts = opts
  }

  /**
   * Given the initial input and context manipulate the context to handle this object directive.
   * @param initial The input passed to the transform.
   * @param ctx The accumulated context for the transform.
   */
  public object = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext) => {
    const nonModelArray = getNonModelObjectArray(def, ctx, new Map())

    nonModelArray.forEach((value: ObjectTypeDefinitionNode) => {
      const nonModelObject = makeNonModelInputObject(value, nonModelArray, ctx)
      if (!typeExist(nonModelObject.name.value, ctx)) {
        ctx.addInput(nonModelObject)
      }
    })

    const { modelName = def.name.value } = getDirectiveArguments(directive)

    const model = this.opts.models[modelName]

    if (!model)
      throw new Error(
        `ModelDirective could not find a corresponding model ${modelName}, use (modelName: String) to set the correct value, or create it in the { models: [] } field.`
      )
    this.resources = new ResourceFactory(model)

    const createFunctionArgs: CreateFunctionArgs = {
      def,
      directive,
      ctx,
      resources: this.resources,
      nonModelArray,
    }

    createQueries(createFunctionArgs)
    createMutations(createFunctionArgs)
    createSubscriptions(createFunctionArgs)

    // Update ModelXConditionInput type
    updateMutationConditionInput(ctx, def)
  }
}
