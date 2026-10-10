declare namespace Repositories.ProjectAccountAssignment {
    interface Contract extends Repositories.Base.Contract<
        Entities.ProjectAccountAssignment,
        Repositories.Mappers.ProjectAccountAssignment.Types
    > {}

    interface QueryContract extends Pick<Contract, "findUniqueOrThrow" | "findMany"> {}
}
