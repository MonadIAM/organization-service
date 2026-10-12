import { InjectEntityManager } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { raw } from "@mikro-orm/postgresql";

import { Organization } from "~context/domain/entities";
import { ExceptionMapper } from "~common/exceptions";
import { kysely } from "~infrastructure/database";
import { BaseRepository } from "~common/mixins";

import { OrganizationMapper } from "../mappers";

@Injectable({ scope: Scope.DEFAULT })
export class OrganizationRepository
    extends BaseRepository<Entities.Organization, Repositories.Mappers.Organization.Types>({
        Mapper: OrganizationMapper,
        Entity: Organization,
    })
    implements Repositories.Organization.Contract
{
    public constructor(
        @InjectEntityManager("read")
        protected readonly readManager: ORM.EntityManager,
    ) {
        super();
    }

    public async hasPendingProcesses(
        props: Repositories.Organization.HasPendingProcesses.Props,
    ): Repositories.Organization.HasPendingProcesses.Result {
        try {
            const { identifiers, transaction } = props;

            if (identifiers.length) {
                const query = kysely
                    .selectNoFrom((eb) =>
                        eb
                            .exists(
                                eb
                                    .selectFrom("organization.project")
                                    .select("id")
                                    .where("organization_id", "in", identifiers)
                                    .where("process", "is not", null)
                                    .unionAll(
                                        eb
                                            .selectFrom("organization.membership")
                                            .select("id")
                                            .where("organization_id", "in", identifiers)
                                            .where("process", "is not", null),
                                    )
                                    .unionAll(
                                        eb
                                            .selectFrom("organization.invite")
                                            .select("id")
                                            .where("organization_id", "in", identifiers)
                                            .where("process", "is not", null),
                                    )
                                    .unionAll(
                                        eb
                                            .selectFrom("organization.department")
                                            .select("id")
                                            .where("organization_id", "in", identifiers)
                                            .where("process", "is not", null),
                                    )
                                    .unionAll(
                                        eb
                                            .selectFrom("organization.team")
                                            .select("id")
                                            .where("organization_id", "in", identifiers)
                                            .where("process", "is not", null),
                                    ),
                            )
                            .as("pending"),
                    )
                    .compile();

                const [result] = await transaction.execute<Repositories.Organization.PendingProcessesRow[]>(
                    query.sql,
                    [...query.parameters],
                    "all",
                );

                return result.pending;
            } else {
                return false;
            }
        } catch (error) {
            throw ExceptionMapper.fromORM(error, this.resource);
        }
    }

    public async getLookupList(
        props: Repositories.Organization.GetLookupList.Props,
    ): Repositories.Organization.GetLookupList.Result {
        try {
            const { pagination, prefilter, term } = props;
            const entityManager = this.readManager.fork();
            const builder = entityManager.createQueryBuilder(Organization, "o");

            builder
                .select(["o.id", "o.title", "o.realm"])
                .limit(pagination.elementsPerPage)
                .offset((pagination.currentPage - 1) * pagination.elementsPerPage);

            if (prefilter) {
                builder.where(prefilter);
            }

            if (term) {
                builder
                    .andWhere("o.title % ?", [term])
                    .orderBy([
                        { [raw("similarity(o.title, ?)", [term])]: "DESC" },
                        { "o.title": "ASC" },
                        { "o.id": "ASC" },
                    ]);
            } else {
                builder.orderBy({ "o.title": "ASC", "o.id": "ASC" });
            }

            return await builder.getResultAndCount();
        } catch (error) {
            throw ExceptionMapper.fromORM(error, this.resource);
        }
    }
}
