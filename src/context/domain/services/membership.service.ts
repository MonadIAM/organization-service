import { Inject, Injectable, Scope } from "@nestjs/common";
import { LockMode } from "@mikro-orm/core";

import { MEMBERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY, PROJECT_REPOSITORY } from "~context/infrastructure/repositories";
import { OrganizationStatus, MembershipStatus } from "~context/enums";
import { Exception } from "~common/exceptions";

import { PROJECT_ACCOUNT_ASSIGNMENT_SERVICE } from "./tokens";
import { Membership } from "../entities";

@Injectable({ scope: Scope.DEFAULT })
export class MembershipService implements Services.Membership.Contract {
    private readonly dictionaryPath = "services.membership";

    public constructor(
        @Inject(PROJECT_REPOSITORY)
        private readonly projectRepository: Repositories.Project.Contract,
        @Inject(PROJECT_ACCOUNT_ASSIGNMENT_SERVICE)
        private readonly projectAssignmentService: Services.ProjectAccountAssignment.InternalContract,
        @Inject(MEMBERSHIP_REPOSITORY)
        private readonly membershipRepository: Repositories.Membership.Contract,
        @Inject(ORGANIZATION_REPOSITORY)
        private readonly organizationRepository: Repositories.Organization.Contract,
    ) {}

    public async ensure(props: Services.Membership.Ensure.Props): Services.Membership.Ensure.Result {
        const { transaction, input, realm } = props;
        const organization = await this.organizationRepository.findUniqueOrThrow({
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            where: { id: input.organization, status: OrganizationStatus.ACTIVE, realm },
            transaction,
        });
        const membership = await this.membershipRepository.findUnique({
            options: { refresh: true },
            where: { organization: organization.id, account: input.account },
            transaction,
        });

        if (membership) {
            if (membership.status === MembershipStatus.LEFT) {
                membership.beginJoin();
            } else if (membership.status !== MembershipStatus.ACTIVE) {
                throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
            }

            return membership;
        } else {
            const entity = new Membership({ organization, account: input.account });
            entity.beginJoin();
            transaction.persist(entity);

            return entity;
        }
    }

    public async completeEnsure(
        props: Services.Membership.CompleteEnsure.Props,
    ): Services.Membership.CompleteEnsure.Result {
        const { transaction, input, realm } = props;
        const organization = await this.organizationRepository.findUniqueOrThrow({
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            where: { realm },
            transaction,
        });
        const membership = await this.membershipRepository.findUniqueOrThrow({
            options: { refresh: true },
            where: { organization: organization.id, account: input.account, id: input.membership },
            transaction,
        });

        if (!input.hrRequest || membership.process !== input.process || membership.status !== MembershipStatus.JOINING) {
            throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
        } else if ("reason" in input) {
            membership.rejectJoin(input.reason);
        } else {
            membership.confirmJoin(new Date(input.joinedAt));
        }

        return membership;
    }

    public async completeLeave(props: Services.Membership.CompleteLeave.Props): Services.Membership.CompleteLeave.Result {
        const { transaction, input, realm } = props;
        const organization = await this.organizationRepository.findUniqueOrThrow({
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            where: { id: input.organization, realm },
            transaction,
        });
        const membership = await this.membershipRepository.findUniqueOrThrow({
            options: { populate: ["organization"], refresh: true },
            where: { organization: organization.id, account: input.account },
            transaction,
        });

        if (organization.owner.id === membership.id || organization.pendingOwner === membership.id) {
            throw Exception.invariantViolation({ messageKey: `${this.dictionaryPath}.OWNER_ACCESS_REQUIRED` });
        }
        if (![MembershipStatus.BLOCKED, MembershipStatus.LEFT].includes(membership.status)) {
            membership.leave();
        }

        const projectAssignments = await this.projectAssignmentService.clean({
            memberships: [membership.id],
            transaction,
        });
        const access = await this.collectAccess({ memberships: [membership], transaction });

        return {
            memberships: [membership],
            assignments: {
                project: projectAssignments,
            },
            access,
        };
    }

    public async confirmJoin(props: Services.Membership.ConfirmJoin.Props): Services.Membership.ConfirmJoin.Result {
        const { input, realm, transaction } = props;
        const membership = await this.membershipRepository.findUnique({
            where: { id: input.membership, account: input.account, organization: { realm } },
            transaction,
        });

        if (membership) {
            if (membership.process !== input.process || membership.status !== MembershipStatus.JOINING) {
                throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
            } else {
                membership.confirmJoin(new Date(input.joinedAt));

                return { access: [] };
            }
        } else {
            return { access: [{ realm, account: input.account }] };
        }
    }

    public async rejectJoin(props: Services.Membership.RejectJoin.Props): Services.Membership.RejectJoin.Result {
        const { input, realm, transaction } = props;
        const membership = await this.membershipRepository.findUnique({
            where: { id: input.membership, account: input.account, organization: { realm } },
            transaction,
        });

        if (membership) {
            if (membership.process !== input.process || membership.status !== MembershipStatus.JOINING) {
                throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
            } else {
                membership.rejectJoin(input.reason);
            }
        }
    }

    public async join(props: Services.Membership.Join.Props): Services.Membership.Join.Result {
        const { transaction, input, realm } = props;
        const [organization, existing] = await Promise.all([
            this.organizationRepository.findUniqueOrThrow({
                where: { id: input.organization, realm, status: OrganizationStatus.ACTIVE },
                transaction,
            }),
            this.membershipRepository.findUnique({
                where: { organization: input.organization, account: input.account },
                transaction,
            }),
        ]);

        if (existing) {
            if (existing.status === MembershipStatus.LEFT) {
                existing.beginJoin();

                return existing;
            } else {
                throw Exception.conflict({ messageKey: `${this.dictionaryPath}.MEMBERSHIP_ALREADY_EXISTS` });
            }
        } else {
            const entity = new Membership({ organization, account: input.account });
            entity.beginJoin();
            transaction.persist(entity);

            return entity;
        }
    }

    public async suspend(props: Services.Membership.Suspend.Props): Services.Membership.Suspend.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        await this.organizationRepository.findUnique({
            where: { realm },
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            transaction,
        });
        const entities = await this.membershipRepository.find({
            where: { id: { $in: unique }, organization: { realm } },
            options: { populate: ["organization"], refresh: true },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.MEMBERSHIPS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                if (entity.organization.owner.id === entity.id || entity.organization.pendingOwner === entity.id) {
                    throw Exception.invariantViolation({ messageKey: "services.membership.OWNER_ACCESS_REQUIRED" });
                }
                entity.suspend();
            }

            const access = await this.collectAccess({ memberships: entities, transaction });

            return { memberships: entities, access };
        }
    }

    public async resume(props: Services.Membership.Resume.Props): Services.Membership.Resume.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        await this.organizationRepository.findUnique({
            where: { realm },
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            transaction,
        });
        const entities = await this.membershipRepository.find({
            where: { id: { $in: unique }, organization: { realm } },
            options: { populate: ["organization"], refresh: true },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.MEMBERSHIPS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.activate();
            }

            const access = await this.collectAccess({ memberships: entities, transaction });

            return { memberships: entities, access };
        }
    }

    public async leave(props: Services.Membership.Leave.Props): Services.Membership.Leave.Result {
        const { transaction, identifiers, account, realm } = props;
        const unique = Array.from(new Set(identifiers));
        await this.organizationRepository.findUnique({
            where: { realm },
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            transaction,
        });
        const entities = await this.membershipRepository.find({
            where: { id: { $in: unique }, organization: { realm }, account },
            options: { populate: ["organization"], refresh: true },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.MEMBERSHIPS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                if (entity.organization.owner.id === entity.id || entity.organization.pendingOwner === entity.id) {
                    throw Exception.invariantViolation({ messageKey: "services.membership.OWNER_ACCESS_REQUIRED" });
                }
                entity.leave();
            }

            const membershipIdentifiers = entities.map(({ id }) => id);
            const projectAssignments = await this.projectAssignmentService.clean({
                memberships: membershipIdentifiers,
                transaction,
            });

            const access = await this.collectAccess({ memberships: entities, transaction });

            return {
                access,
                memberships: entities,
                assignments: {
                    project: projectAssignments,
                },
            };
        }
    }

    public async block(props: Services.Membership.Block.Props): Services.Membership.Block.Result {
        const { transaction, identifiers, realm } = props;
        const unique = Array.from(new Set(identifiers));
        await this.organizationRepository.findUnique({
            where: { realm },
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            transaction,
        });
        const entities = await this.membershipRepository.find({
            where: { id: { $in: unique }, organization: { realm } },
            options: { populate: ["organization"], refresh: true },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.MEMBERSHIPS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                if (entity.organization.owner.id === entity.id || entity.organization.pendingOwner === entity.id) {
                    throw Exception.invariantViolation({ messageKey: "services.membership.OWNER_ACCESS_REQUIRED" });
                }
                entity.block();
            }

            const membershipIdentifiers = entities.map(({ id }) => id);
            const projectAssignments = await this.projectAssignmentService.clean({
                memberships: membershipIdentifiers,
                transaction,
            });

            const access = await this.collectAccess({ memberships: entities, transaction });

            return {
                access,
                memberships: entities,
                assignments: {
                    project: projectAssignments,
                },
            };
        }
    }

    public async clean(props: Services.Membership.Clean.Props): Services.Membership.Clean.Result {
        const { account, excludedOrganizations, transaction } = props;
        await this.organizationRepository.find({
            where: {
                id: { $nin: excludedOrganizations },
                memberships: { $some: { account } },
            },
            options: {
                lockMode: LockMode.PESSIMISTIC_WRITE,
                orderBy: { id: "ASC" },
                refresh: true,
            },
            transaction,
        });
        const memberships = await this.membershipRepository.find({
            where: { account, organization: { $nin: excludedOrganizations } },
            options: { populate: ["organization"], refresh: true },
            transaction,
        });
        if (memberships.some(({ process }) => process)) {
            throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
        } else {
            for (const membership of memberships) {
                if (
                    membership.organization.owner.id === membership.id ||
                    membership.organization.pendingOwner === membership.id
                ) {
                    throw Exception.invariantViolation({ messageKey: "services.membership.OWNER_ACCESS_REQUIRED" });
                }
            }

            const identifiers = memberships.map(({ id }) => id);
            const [access] = await Promise.all([
                this.collectAccess({ memberships, transaction }),
                this.projectAssignmentService.clean({ memberships: identifiers, transaction }),
            ]);

            transaction.remove(memberships);

            return { memberships, access };
        }
    }

    public async collectAccess(props: Services.Membership.CollectAccess.Props): Services.Membership.CollectAccess.Result {
        const { memberships, transaction } = props;
        const projects = await this.projectRepository.find({
            where: {
                organization: { id: { $in: Array.from(new Set(memberships.map(({ organization }) => organization.id))) } },
            },
            transaction,
        });

        return memberships.flatMap((membership) => {
            const realms = Array.from(
                new Set([
                    membership.organization.realm,
                    ...projects
                        .filter((project) => project.organization.id === membership.organization.id)
                        .map((project) => project.realm),
                ]),
            );

            return realms.map((realm) => ({
                account: membership.account,
                realm,
            }));
        });
    }
}
