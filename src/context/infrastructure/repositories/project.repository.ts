import { InjectEntityManager } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { raw } from "@mikro-orm/postgresql";

import { ExceptionMapper } from "~common/exceptions";
import { Project } from "~context/domain/entities";
import { BaseRepository } from "~common/mixins";

import { ProjectMapper } from "../mappers";

@Injectable({ scope: Scope.DEFAULT })
export class ProjectRepository
    extends BaseRepository<Entities.Project, Repositories.Mappers.Project.Types>({
        Mapper: ProjectMapper,
        Entity: Project,
    })
    implements Repositories.Project.Contract
{
    public constructor(
        @InjectEntityManager("read")
        protected readonly readManager: ORM.EntityManager,
    ) {
        super();
    }

    public async getLookupList(props: Repositories.Project.GetLookupList.Props): Repositories.Project.GetLookupList.Result {
        try {
            const { organization, pagination, prefilter, term } = props;
            const entityManager = this.readManager.fork();
            const builder = entityManager.createQueryBuilder(Project, "p");

            builder
                .select(["p.id", "p.name", "p.realm"])
                .limit(pagination.elementsPerPage)
                .offset((pagination.currentPage - 1) * pagination.elementsPerPage);

            if (prefilter) {
                builder.where(prefilter);
            }

            if (organization) {
                builder.andWhere({ "p.organization": organization });
            }

            if (term) {
                builder
                    .andWhere("p.name % ?", [term])
                    .orderBy([{ [raw("similarity(p.name, ?)", [term])]: "DESC" }, { "p.name": "ASC" }, { "p.id": "ASC" }]);
            } else {
                builder.orderBy({ "p.name": "ASC", "p.id": "ASC" });
            }

            return await builder.getResultAndCount();
        } catch (error) {
            throw ExceptionMapper.fromORM(error, this.resource);
        }
    }
}
