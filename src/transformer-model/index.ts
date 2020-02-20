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
import { CreateArgs, DeleteArgs, UpdateArgs, GetArgs, ListArgs } from './types'

export interface ModelServiceResolvers<Context, Type, Source = any> {
  create: IFieldResolver<Source, Context, CreateArgs<Type>>
  update: IFieldResolver<Source, Context, UpdateArgs<Type>>
  get: IFieldResolver<Source, Context, GetArgs<Type>>
  list: IFieldResolver<Source, Context, ListArgs<Type>>
  delete: IFieldResolver<Source, Context, DeleteArgs<Type>>
}

export interface ModelService<Context, Type> {
  resolvers: Partial<ModelServiceResolvers<Context, Type>>
  conditions?: Partial<ModelServiceResolvers<Context, Type, Type>>
}

export interface ModelTransformerOptions<Context> {
  models: Record<string, ModelService<Context, any>>
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
        directive @model(modelName: String) on OBJECT

        input ModelMutationMap {
          create: String
          update: String
          delete: String
        }

        input ModelQueryMap {
          get: String
          list: String
        }
      `
      // input ModelSubscriptionMap {
      //   onCreate: [String]
      //   onUpdate: [String]
      //   onDelete: [String]
      //   level: ModelSubscriptionLevel
      // }

      // enum ModelSubscriptionLevel {
      //   off
      //   public
      //   on
      // }
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
    const resolvers = model.resolvers
    if (!(resolvers.create || resolvers.delete || resolvers.get || resolvers.list || resolvers.update))
      throw new Error(`Model ${modelName} does not provide any resolvers, this model is invalid as a model`)

    const resources = new ResourceFactory(model)

    const createFunctionArgs: CreateFunctionArgs = {
      def,
      directive,
      ctx,
      resources,
      nonModelArray,
      resolvers,
    }

    createQueries(createFunctionArgs)
    createMutations(createFunctionArgs)
    createSubscriptions(createFunctionArgs)

    // Update ModelXConditionInput type
    updateMutationConditionInput(ctx, def)
  }
}
