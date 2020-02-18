import { valueFromASTUntyped, parse, ArgumentNode, DirectiveNode } from 'graphql'
import { ModelDirectiveArgs } from './types'

export function gql(literals: TemplateStringsArray, ...placeholders: string[]) {
  const interleaved = []
  for (let i = 0; i < placeholders.length; i++) {
    interleaved.push(literals[i])
    interleaved.push(placeholders[i])
  }
  interleaved.push(literals[literals.length - 1])
  const actualSchema = interleaved.join('')
  return parse(actualSchema)
}

export function getDirectiveArguments(directive: DirectiveNode): ModelDirectiveArgs {
  return directive.arguments
    ? directive.arguments.reduce(
        (acc: {}, arg: ArgumentNode) => ({
          ...acc,
          [arg.name.value]: valueFromASTUntyped(arg.value),
        }),
        {}
      )
    : []
}
