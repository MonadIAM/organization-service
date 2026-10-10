declare namespace Repositories.Membership {
    interface Contract extends Repositories.Base.Contract<Entities.Membership, Repositories.Mappers.Membership.Types> {}

    interface QueryContract extends Pick<Contract, "findUniqueOrThrow" | "findMany"> {}
}
