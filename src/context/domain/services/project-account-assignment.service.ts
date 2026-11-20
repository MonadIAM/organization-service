import { Inject, Injectable, Scope } from "@nestjs/common";

import { ProjectStatus, MembershipStatus } from "~context/enums";
import { Exception } from "~common/exceptions";
import {
    PROJECT_ACCOUNT_ASSIGNMENT_REPOSITORY,
    MEMBERSHIP_REPOSITORY,
    PROJECT_REPOSITORY,
} from "~context/infrastructure/repositories";

import { ProjectAccountAssignment } from "../entities";

@Injectable({ scope: Scope.DEFAULT })
export class ProjectAccountAssignmentService implements Services.ProjectAccountAssignment.Contract {
    private readonly dictionaryPath = "services.project-account-assignment";

    public constructor(
        @Inject(PROJECT_ACCOUNT_ASSIGNMENT_REPOSITORY)
        private readonly assignmentRepository: Repositories.ProjectAccountAssignment.Contract,
        @Inject(MEMBERSHIP_REPOSITORY)
        private readonly membershipRepository: Repositories.Membership.Contract,
        @Inject(PROJECT_REPOSITORY)
        private readonly projectRepository: Repositories.Project.Contract,
    ) {}

    public async create(
        props: Services.ProjectAccountAssignment.Create.Props,
    ): Services.ProjectAccountAssignment.Create.Result {
        const { transaction, input, actor, realm } = props;
        const [membership, project] = await Promise.all([
            this.membershipRepository.findUniqueOrThrow({
                where: {
                    id: input.membership,
                    status: MembershipStatus.ACTIVE,
                },
                transaction,
            }),
            this.projectRepository.findUniqueOrThrow({
                where: { id: input.project, $or: [{ realm }, { organization: { realm } }], status: ProjectStatus.ACTIVE },
                transaction,
            }),
        ]);

        if (membership.organization.id === project.organization.id) {
            const entity = new ProjectAccountAssignment({ membership, project, assignedBy: actor });
            transaction.persist(entity);

            return entity;
        } else {
            throw Exception.invariantViolation({ messageKey: `${this.dictionaryPath}.ORGANIZATION_MISMATCH` });
        }
    }

    public async revoke(
        props: Services.ProjectAccountAssignment.Revoke.Props,
    ): Services.ProjectAccountAssignment.Revoke.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.assignmentRepository.find({
            where: { id: { $in: unique }, $or: [{ organization: { realm } }, { project: { realm } }] },
            options: { populate: ["membership", "project"] },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ASSIGNMENTS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.revoke();
            }

            return entities;
        }
    }

    public async restore(
        props: Services.ProjectAccountAssignment.Restore.Props,
    ): Services.ProjectAccountAssignment.Restore.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.assignmentRepository.find({
            where: { id: { $in: unique }, $or: [{ organization: { realm } }, { project: { realm } }] },
            options: { populate: ["membership", "project"] },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ASSIGNMENTS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.restore();
            }

            return entities;
        }
    }

    public async purge(
        props: Services.ProjectAccountAssignment.Purge.Props,
    ): Services.ProjectAccountAssignment.Purge.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.assignmentRepository.find({
            where: { id: { $in: unique }, $or: [{ organization: { realm } }, { project: { realm } }] },
            options: { populate: ["membership", "project"] },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ASSIGNMENTS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.canPurge();
                transaction.remove(entity);
            }

            return entities;
        }
    }

    public async clean(
        props: Services.ProjectAccountAssignment.Clean.Props,
    ): Services.ProjectAccountAssignment.Clean.Result {
        const { transaction, memberships } = props;
        const entities = await this.assignmentRepository.find({
            where: { membership: { id: { $in: memberships } } },
            transaction,
        });

        for (const entity of entities) {
            transaction.remove(entity);
        }

        return entities;
    }
}
