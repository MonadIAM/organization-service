import { Inject, Injectable, Scope } from "@nestjs/common";
import { LockMode } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

import { MEMBERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY, PROJECT_REPOSITORY } from "~context/infrastructure/repositories";
import { MembershipStatus, OrganizationStatus, PlatformService, ProjectStatus } from "~context/enums";
import { Exception } from "~common/exceptions";

import { Membership, Organization } from "../entities";

@Injectable({ scope: Scope.DEFAULT })
export class OrganizationService implements Services.Organization.Contract {
    private readonly dictionaryPath = "services.organization";

    public constructor(
        @Inject(PROJECT_REPOSITORY)
        private readonly projectRepository: Repositories.Project.Contract,
        @Inject(ORGANIZATION_REPOSITORY)
        private readonly organizationRepository: Repositories.Organization.Contract,
        @Inject(MEMBERSHIP_REPOSITORY)
        private readonly membershipRepository: Repositories.Membership.Contract,
    ) {}

    public async confirmBootstrap(
        props: Services.Organization.ConfirmBootstrap.Props,
    ): Services.Organization.ConfirmBootstrap.Result {
        const { input, realm, transaction } = props;
        const organization = await this.organizationRepository.findUnique({
            where: { id: input.resource, realm },
            options: {
                populate: ["owner"],
                strategy: "select-in",
                lockMode: LockMode.PESSIMISTIC_WRITE,
                refresh: true,
            },
            transaction,
        });

        if (organization) {
            if (organization.process !== input.process || organization.status !== OrganizationStatus.PROVISIONING) {
                return { realms: [] };
            } else {
                if (organization.confirmBootstrap(input.service ?? PlatformService.ACCESS_CONTROL_SERVICE)) {
                    organization.owner.confirmJoin(new Date());
                }

                return { realms: [] };
            }
        } else {
            return { realms: [{ realm }] };
        }
    }

    public async rejectBootstrap(
        props: Services.Organization.RejectBootstrap.Props,
    ): Services.Organization.RejectBootstrap.Result {
        const { input, realm, transaction } = props;
        const organization = await this.organizationRepository.findUnique({
            where: { id: input.resource, realm },
            options: {
                populate: ["owner"],
                strategy: "select-in",
                lockMode: LockMode.PESSIMISTIC_WRITE,
                refresh: true,
            },
            transaction,
        });

        if (organization) {
            if (organization.process !== input.process || organization.status !== OrganizationStatus.PROVISIONING) {
                return { realms: [] };
            } else {
                transaction.remove(organization);
            }
        }

        return { realms: [{ realm }] };
    }

    public async confirmTransfer(
        props: Services.Organization.ConfirmTransfer.Props,
    ): Services.Organization.ConfirmTransfer.Result {
        const { input, realm, transaction } = props;
        const organization = await this.organizationRepository.findUnique({
            where: { id: input.organization, realm },
            options: {
                populate: ["owner"],
                strategy: "select-in",
                lockMode: LockMode.PESSIMISTIC_WRITE,
                refresh: true,
            },
            transaction,
        });

        if (organization) {
            if (
                organization.process !== input.process ||
                !organization.pendingOwner ||
                organization.owner.account !== input.previousOwner
            ) {
                throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
            } else {
                const membership = await this.membershipRepository.findUniqueOrThrow({
                    where: {
                        id: organization.pendingOwner,
                        organization: organization.id,
                        account: input.owner,
                        status: MembershipStatus.ACTIVE,
                    },
                    options: { refresh: true },
                    transaction,
                });

                organization.transferOwnership({ membership });
                organization.finishTransfer();

                return { realms: [] };
            }
        } else {
            return { realms: [{ realm }] };
        }
    }

    public async rejectTransfer(
        props: Services.Organization.RejectTransfer.Props,
    ): Services.Organization.RejectTransfer.Result {
        const { input, realm, transaction } = props;
        const organization = await this.organizationRepository.findUnique({
            where: { id: input.organization, realm },
            options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
            transaction,
        });

        if (organization) {
            if (organization.process !== input.process || !organization.pendingOwner) {
                throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
            } else {
                organization.finishTransfer();
            }
        }
    }

    public create(props: Services.Organization.Create.Props): Services.Organization.Create.Result {
        const { transaction, input, actor } = props;
        const organization = new Organization({ ...input, realm: randomUUID() });
        const membership = new Membership({ organization, account: actor });

        organization.transferOwnership({ membership });
        organization.beginBootstrap();
        membership.beginJoin(organization.process);
        transaction.persist(organization);
        transaction.persist(membership);

        return { organization, membership };
    }

    public async update(props: Services.Organization.Update.Props): Services.Organization.Update.Result {
        const { transaction, patch, realm, id } = props;
        const entity = await this.organizationRepository.findUniqueOrThrow({
            where: { id, realm },
            transaction,
        });

        entity.update({ patch });
    }

    public async transferOwnership(
        props: Services.Organization.TransferOwnership.Props,
    ): Services.Organization.TransferOwnership.Result {
        const { transaction, membership, realm, id } = props;
        const organization = await this.organizationRepository.findUniqueOrThrow({
            where: { id, realm },
            options: {
                populate: ["owner"],
                strategy: "select-in",
                lockMode: LockMode.PESSIMISTIC_WRITE,
                refresh: true,
            },
            transaction,
        });
        const owner = await this.membershipRepository.findUniqueOrThrow({
            where: { id: membership, organization: id, status: MembershipStatus.ACTIVE },
            options: { refresh: true },
            transaction,
        });

        organization.beginTransfer(owner);

        return { organization, previousOwner: organization.owner.account, owner: owner.account };
    }

    public async revoke(props: Services.Organization.Revoke.Props): Services.Organization.Revoke.Result {
        const { transaction, identifiers, actor, global } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.organizationRepository.find({
            where: { id: { $in: unique }, ...(global ? {} : { owner: { account: actor } }) },
            options: {
                lockMode: LockMode.PESSIMISTIC_WRITE,
                orderBy: { id: "ASC" },
                refresh: true,
            },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ORGANIZATIONS_NOT_FOUND` });
        } else {
            const pending = await this.projectRepository.find({
                where: {
                    organization: { $in: unique },
                    status: ProjectStatus.PROVISIONING,
                },
                transaction,
            });

            if (pending.length) {
                throw Exception.conflict({
                    messageKey: "services.workflow.OPERATION_PENDING",
                });
            } else {
                for (const entity of entities) {
                    entity.revoke();
                }

                const realms = await this.collectRealms({ organizations: entities, transaction });

                return { organizations: entities, realms };
            }
        }
    }

    public async restore(props: Services.Organization.Restore.Props): Services.Organization.Restore.Result {
        const { transaction, identifiers, actor, global } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.organizationRepository.find({
            where: { id: { $in: unique }, ...(global ? {} : { owner: { account: actor } }) },
            options: {
                lockMode: LockMode.PESSIMISTIC_WRITE,
                orderBy: { id: "ASC" },
                refresh: true,
            },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ORGANIZATIONS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.restore();
            }

            const realms = await this.collectRealms({ organizations: entities, transaction });

            return { organizations: entities, realms };
        }
    }

    public async purge(props: Services.Organization.Purge.Props): Services.Organization.Purge.Result {
        const { transaction, identifiers, actor, global } = props;
        const unique = Array.from(new Set(identifiers));
        const entities = await this.organizationRepository.find({
            where: { id: { $in: unique }, ...(global ? {} : { owner: { account: actor } }) },
            options: {
                lockMode: LockMode.PESSIMISTIC_WRITE,
                orderBy: { id: "ASC" },
                refresh: true,
            },
            transaction,
        });

        if (entities.length < unique.length) {
            throw Exception.notFound({ messageKey: `${this.dictionaryPath}.ORGANIZATIONS_NOT_FOUND` });
        } else {
            for (const entity of entities) {
                entity.canPurge();
            }

            return this.remove({ organizations: entities, transaction });
        }
    }

    public async purgeOwned(props: Services.Organization.PurgeOwned.Props): Services.Organization.PurgeOwned.Result {
        const { transaction, account } = props;
        const organizations = await this.organizationRepository.find({
            where: { owner: { account } },
            options: {
                lockMode: LockMode.PESSIMISTIC_WRITE,
                orderBy: { id: "ASC" },
                refresh: true,
            },
            transaction,
        });

        return this.remove({ organizations, transaction });
    }

    private async remove(props: Services.Organization.CollectRealms.Props): Services.Organization.Purge.Result {
        const { organizations, transaction } = props;
        const [realms, pending] = await Promise.all([
            this.collectRealms({ organizations, transaction }),
            this.organizationRepository.hasPendingProcesses({
                identifiers: organizations.map(({ id }) => id),
                transaction,
            }),
        ]);

        if (organizations.some(({ process }) => process) || pending) {
            throw Exception.conflict({ messageKey: "services.workflow.OPERATION_CONFLICT" });
        } else {
            transaction.remove(organizations);

            return { organizations, realms };
        }
    }

    public async collectRealms(
        props: Services.Organization.CollectRealms.Props,
    ): Services.Organization.CollectRealms.Result {
        const { organizations, transaction } = props;
        const projects = await this.projectRepository.find({
            where: {
                organization: { id: { $in: organizations.map(({ id }) => id) } },
                status: {
                    $nin: [ProjectStatus.PROVISIONING, ProjectStatus.FAILED],
                },
            },
            options: { disableIdentityMap: true },
            transaction,
        });

        return organizations.flatMap((organization) =>
            Array.from(
                new Set([
                    organization.realm,
                    ...projects
                        .filter((project) => project.organization.id === organization.id)
                        .map((project) => project.realm),
                ]),
            ).map((realm) => ({
                realm,
            })),
        );
    }
}
