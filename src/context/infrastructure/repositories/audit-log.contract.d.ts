declare namespace Repositories.AuditLog {
    interface Contract extends Repositories.Base.Contract<SystemEntities.AuditLog, Repositories.Mappers.AuditLog.Types> {}

    interface QueryContract extends Pick<Contract, "findUniqueOrThrow" | "findMany"> {}
}
