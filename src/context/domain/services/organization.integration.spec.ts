import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { OrganizationIntegrationHelpers } from "~testing/integration/domain-service/organization.helpers";
import { MembershipIntegrationHelpers } from "~testing/integration/domain-service/membership.helpers";
import { RealmType, OrganizationStatus, MembershipStatus, PlatformService } from "~context/enums";
import { AccountIntegrationHelpers } from "~testing/integration/domain-service/account.helpers";
import { ConcurrencyIntegrationHelpers } from "~testing/integration/concurrency.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import {
    ProjectAccountAssignment,
    Organization,
    Membership,
    Department,
    Project,
    Invite,
    Team,
} from "~context/domain/entities";

const helpers = new OrganizationIntegrationHelpers();

describe("[DomainService] - Organization", () => {
    const suite = postgresSuite({
        repository: (context) => ({
            ...helpers.service(context),
            ...new MembershipIntegrationHelpers().service(context),
            ...new AccountIntegrationHelpers().service(context),
            concurrency: new ConcurrencyIntegrationHelpers(context),
        }),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Method] - create", () => {
        it("[case] - creates one persisted organization with its owner membership", async () => {
            // Arrange
            const actor = randomUUID();

            // Act
            const result = await suite.transaction((transaction) =>
                Promise.resolve(
                    suite.repository().organizationService.create({
                        input: { title: "Created", description: "Description" },
                        transaction,
                        actor,
                    }),
                ),
            );
            const result1 = await suite.transaction((transaction) =>
                transaction.count(Organization, { id: result.organization.id }),
            );
            const result2 = await suite.transaction((transaction) =>
                transaction.count(Membership, {
                    id: result.membership.id,
                    account: actor,
                }),
            );

            // Assert
            expect(result1).toBe(1);
            expect(result2).toBe(1);
        });
    });

    describe("[Behavior] - bootstrap workflow", () => {
        it("[case] - activates the organization and owner only for the matching bootstrap process", async () => {
            // Arrange
            const actor = randomUUID();
            const result = await suite.transaction((transaction) =>
                Promise.resolve(
                    suite.repository().organizationService.create({
                        actor,
                        transaction,
                        input: { title: "Pending", description: "Pending" },
                    }),
                ),
            );
            const request = {
                actor,
                realm: result.organization.realm,
                input: {
                    type: RealmType.ORGANIZATION as const,
                    resource: result.organization.id,
                    process: result.organization.process!,
                },
            };

            // Act
            const result1 = await suite.transaction((transaction) =>
                suite.repository().organizationService.confirmBootstrap({
                    ...request,
                    input: { ...request.input, process: randomUUID() },
                    transaction,
                }),
            );
            const pending = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, result.organization.id),
            );
            const result2 = pending.status;
            await suite.transaction((transaction) =>
                suite.repository().organizationService.confirmBootstrap({
                    ...request,
                    transaction,
                }),
            );
            await suite.transaction((transaction) =>
                suite.repository().organizationService.confirmBootstrap({
                    ...request,
                    input: { ...request.input, service: PlatformService.HR_SERVICE },
                    transaction,
                }),
            );
            const [organization, membership] = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.findOneOrFail(Organization, result.organization.id),
                    transaction.findOneOrFail(Membership, result.membership.id),
                ]),
            );

            // Assert
            expect(result1).toEqual({ realms: [] });
            expect(result2).toBe(OrganizationStatus.PROVISIONING);
            expect(organization.status).toBe(OrganizationStatus.ACTIVE);
            expect(organization.process).toBeNull();
            expect(membership.status).toBe(MembershipStatus.ACTIVE);
        });
    });

    describe("[Behavior] - bootstrap concurrency and rollback", () => {
        it("[case] - preserves both concurrent confirmations", async () => {
            // Arrange
            const { organizationService, concurrency } = suite.repository();
            const actor = randomUUID();
            const { organization, membership } = await suite.transaction((transaction) =>
                Promise.resolve(
                    organizationService.create({
                        actor,
                        input: { title: "Pending", description: "Description" },
                        transaction,
                    }),
                ),
            );
            const request = {
                actor,
                realm: organization.realm,
                input: { type: RealmType.ORGANIZATION as const, process: organization.process!, resource: organization.id },
            };

            // Act
            const result = await concurrency.run({
                first: (transaction) => organizationService.confirmBootstrap({ ...request, transaction }),
                second: (transaction) =>
                    organizationService.confirmBootstrap({
                        ...request,
                        input: { ...request.input, service: PlatformService.HR_SERVICE },
                        transaction,
                    }),
            });
            const result1 = result.second.status;
            const loaded = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, organization.id),
            );
            const result2 = loaded.status;
            const result3 = loaded.bootstrapPending;
            const owner = await suite.transaction((transaction) => transaction.findOneOrFail(Membership, membership.id));

            // Assert
            expect(result1).toBe("fulfilled");
            expect(result2).toBe(OrganizationStatus.ACTIVE);
            expect(result3).toEqual([]);
            expect(owner.status).toBe(MembershipStatus.ACTIVE);
        });

        it("[case] - deletes the provisional organization and owner together and compensates a late confirmation", async () => {
            // Arrange
            const { organizationService } = suite.repository();
            const actor = randomUUID();
            const { organization, membership } = await suite.transaction((transaction) =>
                Promise.resolve(
                    organizationService.create({
                        actor,
                        input: { title: "Pending", description: "Description" },
                        transaction,
                    }),
                ),
            );
            const request = {
                actor,
                realm: organization.realm,
                input: { type: RealmType.ORGANIZATION as const, process: organization.process!, resource: organization.id },
            };

            // Act
            await suite.transaction((transaction) => organizationService.confirmBootstrap({ ...request, transaction }));
            const result = await suite.transaction((transaction) =>
                organizationService.rejectBootstrap({
                    ...request,
                    input: { ...request.input, reason: "HR rejected" },
                    transaction,
                }),
            );
            const result1 = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.count(Organization, organization.id),
                    transaction.count(Membership, membership.id),
                ]),
            );
            const result2 = await suite.transaction((transaction) =>
                organizationService.confirmBootstrap({
                    ...request,
                    input: { ...request.input, service: PlatformService.HR_SERVICE },
                    transaction,
                }),
            );

            // Assert
            expect(result).toEqual({ realms: [{ realm: organization.realm }] });
            expect(result1).toEqual([0, 0]);
            expect(result2).toEqual({ realms: [{ realm: organization.realm }] });
        });
    });

    describe("[Behavior] - ownership transfer", () => {
        it("[case] - keeps the previous owner until transfer confirmation", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });

            // Act
            const started = await suite.transaction((transaction) =>
                suite.repository().organizationService.transferOwnership({
                    realm: organization.realm,
                    id: organization.id,
                    membership: membership.id,
                    transaction,
                }),
            );
            const request = {
                actor: organization.owner.account,
                realm: organization.realm,
                input: {
                    process: started.organization.process!,
                    organization: organization.id,
                    owner: membership.account,
                    previousOwner: organization.owner.account,
                },
            };
            const result = started.organization.owner.id;
            await suite.transaction((transaction) =>
                suite.repository().organizationService.confirmTransfer({
                    ...request,
                    transaction,
                }),
            );
            const confirmed = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, organization.id),
            );
            const result1 = confirmed.owner.id;
            const result2 = confirmed.process;
            const result3 = suite.transaction((transaction) =>
                suite.repository().organizationService.confirmTransfer({
                    ...request,
                    transaction,
                }),
            );

            // Assert
            expect(result).toBe(organization.owner.id);
            expect(result1).toBe(membership.id);
            expect(result2).toBeNull();
            await expect(result3).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
        });
    });

    describe("[Method] - revoke", () => {
        it("[case] - rolls back the whole bulk transition when one organization is missing", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().organizationService.revoke({
                    identifiers: [organization.id, randomUUID()],
                    actor: organization.owner.account,
                    global: false,
                    transaction,
                }),
            );
            await Promise.allSettled([result]);
            const loaded = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, { id: organization.id }),
            );

            // Assert
            await expect(result).rejects.toThrow("services.organization.ORGANIZATIONS_NOT_FOUND");
            expect(loaded.status).toBe("ACTIVE");
        });
    });

    describe("[Behavior] - concurrent ownership transfer", () => {
        it.each(["leave", "block", "suspend"] as const)(
            "[case] - rejects %s after a concurrent transfer reserves the next owner",
            async (operation) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const membership = await suite.fixtures().createMembership({ organization });
                const { organizationService, membershipService, concurrency } = suite.repository();

                // Act
                const result = await concurrency.run({
                    first: (transaction) =>
                        organizationService.transferOwnership({
                            realm: organization.realm,
                            id: organization.id,
                            membership: membership.id,
                            transaction,
                        }),
                    second: async (transaction) => {
                        await transaction.findOneOrFail(Organization, organization.id);

                        return membershipService[operation]({
                            realm: organization.realm,
                            identifiers: [membership.id],
                            account: membership.account,
                            transaction,
                        });
                    },
                });
                const result1 = result.second;
                const loaded = await suite.transaction((transaction) =>
                    transaction.findOneOrFail(Membership, membership.id),
                );

                // Assert
                expect(result1).toEqual({
                    status: "rejected",
                    reason: expect.objectContaining({
                        message: "services.membership.OWNER_ACCESS_REQUIRED",
                    }),
                });
                expect(loaded.status).toBe(MembershipStatus.ACTIVE);
                expect(result.first.organization.pendingOwner).toBe(membership.id);
            },
        );

        it.each([
            { operation: "leave" as const, status: MembershipStatus.LEFT },
            { operation: "block" as const, status: MembershipStatus.BLOCKED },
            {
                operation: "suspend" as const,
                status: MembershipStatus.SUSPENDED,
            },
        ])(
            "[case] - rejects transfer after concurrent $operation changes the candidate membership",
            async ({ operation, status }) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const membership = await suite.fixtures().createMembership({ organization });
                const { organizationService, membershipService, concurrency } = suite.repository();

                // Act
                const result = await concurrency.run({
                    first: (transaction) =>
                        membershipService[operation]({
                            realm: organization.realm,
                            identifiers: [membership.id],
                            account: membership.account,
                            transaction,
                        }),
                    second: async (transaction) => {
                        await transaction.findOneOrFail(Membership, membership.id);

                        return organizationService.transferOwnership({
                            realm: organization.realm,
                            id: organization.id,
                            membership: membership.id,
                            transaction,
                        });
                    },
                });
                const result1 = result.second.status;
                const [loaded, candidate] = await suite.transaction((transaction) =>
                    Promise.all([
                        transaction.findOneOrFail(Organization, organization.id),
                        transaction.findOneOrFail(Membership, membership.id),
                    ]),
                );

                // Assert
                expect(result1).toBe("rejected");
                expect(loaded.owner.id).toBe(organization.owner.id);
                expect(loaded.pendingOwner).toBeNull();
                expect(loaded.process).toBeNull();
                expect(candidate.status).toBe(status);
            },
        );

        it.each(["confirmTransfer", "rejectTransfer"] as const)(
            "[case] - checks owner protection after concurrent %s finishes",
            async (operation) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const membership = await suite.fixtures().createMembership({ organization });
                const { organizationService, membershipService, concurrency } = suite.repository();
                const started = await suite.transaction((transaction) =>
                    organizationService.transferOwnership({
                        realm: organization.realm,
                        id: organization.id,
                        membership: membership.id,
                        transaction,
                    }),
                );

                // Act
                const result = await concurrency.run({
                    first: async (transaction) => {
                        await organizationService[operation]({
                            actor: organization.owner.account,
                            realm: organization.realm,
                            input: {
                                process: started.organization.process!,
                                organization: organization.id,
                                previousOwner: organization.owner.account,
                                owner: membership.account,
                                reason: "Rejected",
                            },
                            transaction,
                        });
                    },
                    second: (transaction) =>
                        membershipService.leave({
                            realm: organization.realm,
                            identifiers: [membership.id],
                            account: membership.account,
                            transaction,
                        }),
                });
                const result1 = result.second.status;
                const [loaded, candidate] = await suite.transaction((transaction) =>
                    Promise.all([
                        transaction.findOneOrFail(Organization, organization.id),
                        transaction.findOneOrFail(Membership, membership.id),
                    ]),
                );

                // Assert
                expect(result1).toBe(operation === "confirmTransfer" ? "rejected" : "fulfilled");
                expect(loaded.pendingOwner).toBeNull();
                expect(loaded.process).toBeNull();
                expect(loaded.owner.id).toBe(operation === "confirmTransfer" ? membership.id : organization.owner.id);
                expect(candidate.status).toBe(
                    operation === "confirmTransfer" ? MembershipStatus.ACTIVE : MembershipStatus.LEFT,
                );
            },
        );

        it("[case] - rejects account purge after a concurrent transfer reserves the next owner", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            const { organizationService, accountService, concurrency } = suite.repository();

            // Act
            const result = await concurrency.run({
                first: (transaction) =>
                    organizationService.transferOwnership({
                        realm: organization.realm,
                        id: organization.id,
                        membership: membership.id,
                        transaction,
                    }),
                second: (transaction) =>
                    accountService.purge({
                        account: membership.account,
                        transaction,
                    }),
            });
            const result1 = result.second;
            const result2 = await suite.transaction((transaction) => transaction.count(Membership, membership.id));

            // Assert
            expect(result1).toEqual({
                status: "rejected",
                reason: expect.objectContaining({
                    message: "services.account.TRANSFER_PENDING",
                }),
            });
            expect(result2).toBe(1);
        });

        it("[case] - rejects transfer after a concurrent account purge removes the candidate", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            const { organizationService, accountService, concurrency } = suite.repository();

            // Act
            const result = await concurrency.run({
                first: (transaction) =>
                    accountService.purge({
                        account: membership.account,
                        transaction,
                    }),
                second: (transaction) =>
                    organizationService.transferOwnership({
                        realm: organization.realm,
                        id: organization.id,
                        membership: membership.id,
                        transaction,
                    }),
            });
            const result1 = result.second.status;
            const loaded = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, organization.id),
            );
            const result2 = loaded.pendingOwner;
            const result3 = loaded.owner.id;
            const result4 = await suite.transaction((transaction) => transaction.count(Membership, membership.id));

            // Assert
            expect(result1).toBe("rejected");
            expect(result2).toBeNull();
            expect(result3).toBe(organization.owner.id);
            expect(result4).toBe(0);
        });
    });

    describe("[Behavior] - lifecycle ownership", () => {
        it.each(["revoke", "restore", "purge"] as const)(
            "[case] - rejects a mixed owned/foreign batch for %s without changing either target",
            async (method) => {
                // Arrange
                const actor = randomUUID();
                const owned = await suite.fixtures().createOrganization({
                    ownerAccount: actor,
                });
                const foreign = await suite.fixtures().createOrganization({
                    ownerAccount: randomUUID(),
                });
                if (method !== "revoke") {
                    await suite.transaction((transaction) =>
                        transaction.nativeUpdate(
                            Organization,
                            { id: { $in: [owned.id, foreign.id] } },
                            { status: OrganizationStatus.REVOKED },
                        ),
                    );
                }

                // Act
                const result = suite.transaction((transaction) =>
                    suite.repository().organizationService[method]({
                        actor,
                        global: false,
                        identifiers: [owned.id, foreign.id],
                        transaction,
                    }),
                );
                await Promise.allSettled([result]);
                const statuses = [];
                for await (const id of [owned.id, foreign.id]) {
                    const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Organization, id));
                    statuses.push(loaded.status);
                }

                // Assert
                await expect(result).rejects.toThrow("services.organization.ORGANIZATIONS_NOT_FOUND");
                for (const status of statuses) {
                    expect(status).toBe(method === "revoke" ? OrganizationStatus.ACTIVE : OrganizationStatus.REVOKED);
                }
            },
        );

        it.each(["revoke", "restore", "purge"] as const)(
            "[case] - permits global %s for another owner's target",
            async (method) => {
                // Arrange
                const actor = randomUUID();
                const target = await suite.fixtures().createOrganization();
                if (method !== "revoke") {
                    await suite.transaction((transaction) =>
                        transaction.nativeUpdate(Organization, { id: target.id }, { status: OrganizationStatus.REVOKED }),
                    );
                }

                // Act
                await suite.transaction((transaction) =>
                    suite.repository().organizationService[method]({
                        actor,
                        global: true,
                        identifiers: [target.id],
                        transaction,
                    }),
                );
                const remaining =
                    method === "purge"
                        ? await suite.transaction((transaction) => transaction.count(Organization, { id: target.id }))
                        : await suite.transaction((transaction) => transaction.findOneOrFail(Organization, target.id));

                // Assert
                if (typeof remaining === "number") {
                    expect(remaining).toBe(0);
                } else {
                    expect(remaining.status).toBe(
                        method === "revoke" ? OrganizationStatus.REVOKED : OrganizationStatus.ACTIVE,
                    );
                }
            },
        );

        it("[case] - allows the owner to revoke, restore, revoke and purge without a target realm context", async () => {
            // Arrange
            const actor = randomUUID();
            const target = await suite.fixtures().createOrganization({ ownerAccount: actor });

            // Act
            for await (const method of ["revoke", "restore", "revoke", "purge"] as const) {
                await suite.transaction((transaction) =>
                    suite.repository().organizationService[method]({
                        actor,
                        global: false,
                        identifiers: [target.id],
                        transaction,
                    }),
                );
            }
            const result = await suite.transaction((transaction) => transaction.count(Organization, { id: target.id }));

            // Assert
            expect(result).toBe(0);
        });
    });

    describe("[Behavior] - purge cascades", () => {
        it("[case] - deletes all owned rows while preserving another organization and collecting project realms", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const foreign = await suite.fixtures().createOrganization();
            const project = await suite.fixtures().createProject({ organization });
            const department = await suite.fixtures().createDepartment({ organization });
            await suite.fixtures().createTeam({ department });
            await suite.fixtures().createInvite({ organization });
            const assignment = await suite
                .fixtures()
                .createProjectAccountAssignment({ project, membership: organization.owner });
            await suite.transaction(async (transaction) => {
                await transaction.nativeUpdate(Project, project.id, { manager: assignment.id });
                await transaction.nativeUpdate(Organization, organization.id, { status: OrganizationStatus.REVOKED });
            });

            // Act
            const result = await suite.transaction(async (transaction) => {
                const result = await suite.repository().organizationService.purge({
                    identifiers: [organization.id],
                    actor: organization.owner.account,
                    global: false,
                    transaction,
                });
                await transaction.flush();
                return result;
            });
            const result1 = result.realms.map(({ realm }) => realm).sort();
            const result2 = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.count(Organization, organization.id),
                    transaction.count(Membership, { organization: organization.id }),
                    transaction.count(Project, { organization: organization.id }),
                    transaction.count(ProjectAccountAssignment, { organization: organization.id }),
                    transaction.count(Department, { organization: organization.id }),
                    transaction.count(Team, { organization: organization.id }),
                    transaction.count(Invite, { organization: organization.id }),
                    transaction.count(Organization, foreign.id),
                    transaction.count(Membership, foreign.owner.id),
                ]),
            );

            // Assert
            expect(result1).toEqual([organization.realm, project.realm].sort());
            expect(result2).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1]);
        });

        it("[case] - still rejects deleting a department with teams", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const department = await suite.fixtures().createDepartment({ organization });
            const team = await suite.fixtures().createTeam({ department });

            // Act
            const result = suite.transaction((transaction) => transaction.nativeDelete(Department, department.id));
            await Promise.allSettled([result]);
            const result2 = await suite.transaction((transaction) => transaction.count(Team, team.id));

            // Assert
            await expect(result).rejects.toThrow();
            expect(result2).toBe(1);
        });

        it("[case] - still rejects deleting a membership with project assignments", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            const project = await suite.fixtures().createProject({ organization });
            const assignment = await suite.fixtures().createProjectAccountAssignment({ membership, project });

            // Act
            const result = suite.transaction((transaction) => transaction.nativeDelete(Membership, membership.id));
            await Promise.allSettled([result]);
            const result2 = await suite.transaction((transaction) =>
                transaction.count(ProjectAccountAssignment, assignment.id),
            );

            // Assert
            await expect(result).rejects.toThrow();
            expect(result2).toBe(1);
        });
    });
});
