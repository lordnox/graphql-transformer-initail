import { parse, graphql } from 'graphql'
import { GraphQLTransform } from './GraphQLTransform'
import { ModelTransformer } from './transformer-model'
import { TestTransformer, TestConfigTransformer } from './test-transformer'

import { expectFieldsOnTypeGenerator } from './__mocks__/helpers'
import { makeExecutableSchema } from 'graphql-tools'

const typeDefs = `
  type Author @model {
    name: String!
  }

  type Post @model {
    id: ID! # id: ID! is a required attribute.
    title: String!
    tags: [String!]!
    author: Author
  }
`

interface Context {
  auth: {
    userId: string
  }
}

const users = [
  { id: 'abc', name: 'XXX', email: 'YYY' },
  { id: 'me!', name: 'Correct', email: 'i@wuz.found' },
]

const transform = (typeDefs: string, resolvers: any = {}) => {
  const tranformer = new GraphQLTransform({
    transformers: [
      new TestConfigTransformer(),
      new TestTransformer(),
      new ModelTransformer<Context>({
        models: {
          Users: {
            resolvers: {
              get: () => null,
              list: (_, __, ctx) => ({ items: users.filter(user => user.id === ctx.auth.userId) }),
              create: () => null,
              update: () => null,
              delete: () => null,
            },
          },
          Posts: {
            resolvers: {
              get: () => null,
              list: () => null,
            },
          },
        },
      }),
    ],
  })
  return tranformer.transform({
    typeDefs,
    resolvers,
  })
}

it('should generate all proper types', () => {
  const { typeDefs } = transform(`
    type User @model(modelName: "Users") {
      id: ID!
      name: String!
      email: String!
    }
  `)

  const document = parse(typeDefs)
  const expectFieldsOnType = expectFieldsOnTypeGenerator(document)
  expectFieldsOnType('Query', ['getUser', 'listUsers'])
  expectFieldsOnType('Mutation', ['createUser', 'updateUser', 'deleteUser'])
  expectFieldsOnType('User', ['id', 'name', 'email'])
  expectFieldsOnType('CreateUserInput', ['id', 'name', 'email'])
  expectFieldsOnType('UpdateUserInput', ['id', 'name', 'email'])
  expectFieldsOnType('DeleteUserInput', ['id'])
  expectFieldsOnType('ModelUserFilterInput', ['id', 'name', 'email', 'and', 'or', 'not'])
  expectFieldsOnType('ModelUserConditionInput', ['name', 'email', 'and', 'or', 'not'])
  expectFieldsOnType('ModelUserConnection', ['items', 'nextToken'])
  expectFieldsOnType('DeleteUserInput', ['id'])
})

it('should omit generating mutations', () => {
  const { typeDefs } = transform(`
    type Posts @model {
      id: ID!
      name: String!
      email: String!
    }

    type Mutation {
      dummy: Int # Make sure the Mutation type exists
    }
  `)
  // console.log(schema)
  const document = parse(typeDefs)
  const expectFieldsOnType = expectFieldsOnTypeGenerator(document)
  expectFieldsOnType('Query', ['getPosts', 'listPostss'])
  expectFieldsOnType('Mutation', ['createPosts', 'updatePosts', 'deletePosts'], true)
})

it('should throw an error if the model does not exists', () => {
  expect(() => {
    transform(`
      type Unknown @model {
        id: ID!
        name: String!
        email: String!
      }
    `)
  }).toThrow()
})

it('should generate the model correctly to be able to fetch this user', async () => {
  const { typeDefs, resolvers } = transform(`
    type User @model(modelName: "Users") {
      id: ID!
      name: String!
      email: String!
    }
  `)

  const schema = makeExecutableSchema({ typeDefs, resolvers })
  const contextValue: Context = { auth: { userId: 'me!' } }
  const result = await graphql({
    schema,
    source: '{ user: listUsers { items { id name email }}}',
    contextValue,
  })
  expect(result.data).toHaveProperty('user')
  expect(result.data.user.items).toHaveLength(1)
  expect(result.data.user.items[0]).toEqual(users[1])
})

it('should create a configurable directive that updates the resolver result', async () => {
  const { typeDefs, resolvers } = transform(
    `
    schema @testConfig(value: " World!") {
      query: Query
    }

    type Query {
      hello: String @test
    }
  `,
    { Query: { hello: () => 'Hello' } }
  )
  const schema = makeExecutableSchema({ typeDefs, resolvers })
  const contextValue: Context = { auth: { userId: 'me!' } }
  const result = await graphql({
    schema,
    source: '{ hello }',
    contextValue,
  })
  expect(result.data.hello).toBe('Hello World!')
})

it('should handle multible models', () => {
  const { typeDefs } = transform(`
    type User @model(modelName: "Users") {
      id: ID!
      name: String!
      email: String!
      Posts: [Post!]!
    }

    type Post @model(modelName: "Posts") {
      id: ID!
      content: String!
      Author: User!
    }
  `)
  const document = parse(typeDefs)
  const expectFieldsOnType = expectFieldsOnTypeGenerator(document)
  expectFieldsOnType('Query', ['getUser', 'listUsers', 'getPost', 'listPosts'])
})
