export type Filter<Type> = {
  _and?: Array<Filter<Type>>
  _or?: Array<Filter<Type>>
  _not?: Filter<Type>
} & Partial<Type>

export type Where<Type> = Filter<Type>
export type Order = any
export type Page = any
export type Data<Type> = Type

export interface NodeType {
  id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface ListType<Type extends NodeType> {
  page: PageData
  nodes: Type[]
}

export interface PageData {
  offset: number
  limit: number
}

export interface GetArgs<Type> {
  where: Where<Type>
  order: Order
}

export interface ListArgs<Type> {
  where: Where<Type>
  order: Order
  page: Page
}

export interface CreateArgs<Type> {
  data: Data<Type>
}

export interface UpdateArgs<Type> {
  where: Where<Type>
  data: Partial<Data<Type>>
}

export interface DeleteArgs<Type> {
  where: Where<Type>
}
