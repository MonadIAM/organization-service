declare namespace Repositories.ChangeLog {
    interface Contract extends Repositories.Base.Contract<SystemEntities.ChangeLog, Repositories.Mappers.ChangeLog.Types> {}

    interface QueryContract extends Pick<Contract, "findUniqueOrThrow" | "findMany"> {}
}
