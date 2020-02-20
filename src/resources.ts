import { graphqlName, plurality, toUpper } from './transformer-common'
import { IFieldResolver } from 'graphql-tools'

export const RESOLVER = 'type:resolver'

export interface Resource {
  type: string
  fieldName: string
  queryTypeName: string
  resolver: IFieldResolver<any, any>
}

export const createResolver = (base: {
  fieldName: string
  queryTypeName: string
  resolver: IFieldResolver<any, any>
}) => ({
  type: RESOLVER,
  ...base,
})

export const createResolverGenerator = (model: any) => (query: string, fieldName: string, queryTypeName: string) =>
  createResolver({
    fieldName,
    queryTypeName,
    resolver: model.resolvers[query],
  })

// this is the knex resource factory
export class ResourceFactory<Model = any> {
  public model: Model
  private createResolver: (query: string, fieldName: string, queryTypeName: string) => Resource

  constructor(model: Model) {
    this.model = model
    this.createResolver = createResolverGenerator(model)
  }

  // .initTemplate

  public makeCreateResolver = (fieldName: string, queryTypeName: string = 'Mutation') =>
    this.createResolver('create', fieldName, queryTypeName)

  public makeDeleteResolver = (fieldName: string, queryTypeName: string = 'Mutation') =>
    this.createResolver('delete', fieldName, queryTypeName)

  public makeGetResolver = (fieldName: string, queryTypeName: string = 'Query') =>
    this.createResolver('get', fieldName, queryTypeName)

  public makeUpdateResolver = (fieldName: string, queryTypeName: string = 'Mutation') =>
    this.createResolver('update', fieldName, queryTypeName)

  public makeListResolver = (fieldName: string, queryTypeName: string = 'Query') =>
    this.createResolver('list', fieldName, queryTypeName)

  // .makeModelTable
  // .makeDataSourceOutput
  // .makeDynamoDBDataSource
  // .makeIAMRole
  // .makeTableNameOutput
  // .makeTableStreamArnOutput

  public assertModelExists = (model: string) => true
}
