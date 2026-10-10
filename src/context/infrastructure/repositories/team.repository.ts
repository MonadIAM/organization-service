import { InjectEntityManager } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { raw } from "@mikro-orm/postgresql";

import { ExceptionMapper } from "~common/exceptions";
import { BaseRepository } from "~common/mixins";
import { Team } from "~context/domain/entities";

import { TeamMapper } from "../mappers";

@Injectable({ scope: Scope.DEFAULT })
export class TeamRepository
    extends BaseRepository<Entities.Team, Repositories.Mappers.Team.Types>({
        Mapper: TeamMapper,
        Entity: Team,
    })
    implements Repositories.Team.Contract
{
    public constructor(
        @InjectEntityManager("read")
        protected readonly readManager: ORM.EntityManager,
    ) {
        super();
    }

    public async getLookupList(props: Repositories.Team.GetLookupList.Props): Repositories.Team.GetLookupList.Result {
        try {
            const { organization, department, pagination, prefilter, term } = props;
            const entityManager = this.readManager.fork();
            const builder = entityManager.createQueryBuilder(Team, "t");

            builder
                .select(["t.id", "t.name"])
                .limit(pagination.elementsPerPage)
                .offset((pagination.currentPage - 1) * pagination.elementsPerPage);

            if (prefilter) {
                builder.where(prefilter);
            }

            if (organization) {
                builder.andWhere({ "t.organization": organization });
            }

            if (department) {
                builder.andWhere({ "t.department": department });
            }

            if (term) {
                builder
                    .andWhere("t.name % ?", [term])
                    .orderBy([{ [raw("similarity(t.name, ?)", [term])]: "DESC" }, { "t.name": "ASC" }, { "t.id": "ASC" }]);
            } else {
                builder.orderBy({ "t.name": "ASC", "t.id": "ASC" });
            }

            return await builder.getResultAndCount();
        } catch (error) {
            throw ExceptionMapper.fromORM(error, this.resource);
        }
    }
}
