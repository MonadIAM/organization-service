import { describe, expect, it } from "@jest/globals";

import { OrganizationIntegrationHelpers } from "~testing/integration/domain-service/organization.helpers";
import { ProjectIntegrationHelpers } from "~testing/integration/domain-service/project.helpers";
import { ConcurrencyIntegrationHelpers } from "~testing/integration/concurrency.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { RealmType, OrganizationStatus, ProjectStatus } from "~context/enums";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { Organization, Project } from "~context/domain/entities";

const helpers = new ProjectIntegrationHelpers();

describe("[DomainService] - Project", () => {
    const suite = postgresSuite({
        repository: (context) => ({
            ...helpers.service(context),
            ...new OrganizationIntegrationHelpers().service(context),
            concurrency: new ConcurrencyIntegrationHelpers(context),
        }),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Behavior] - project lifecycle", () => {
        it("[case] - creates and archives a project within its organization realm", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();

            // Act
            const project = await suite.transaction((transaction) =>
                suite.repository().projectService.create({
                    input: {
                        organization: organization.id,
                        realm: organization.realm,
                        name: "Created",
                        description: "Description",
                    },
                    transaction,
                }),
            );
            await suite.transaction((transaction) =>
                suite.repository().projectService.confirmBootstrap({
                    actor: organization.owner.account,
                    realm: project.realm,
                    input: {
                        type: RealmType.PROJECT,
                        resource: project.id,
                        process: project.process!,
                    },
                    transaction,
                }),
            );
            await suite.transaction((transaction) =>
                suite.repository().projectService.archive({
                    identifiers: [project.id],
                    realm: organization.realm,
                    transaction,
                }),
            );
            const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Project, { id: project.id }));

            // Assert
            expect(loaded.status).toBe("ARCHIVED");
        });
    });

    describe("[Behavior] - concurrent project and organization changes", () => {
        it("[case] - rejects project creation after a concurrent organization revoke", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const existing = await suite.fixtures().createProject({ organization });
            const { organizationService, projectService, concurrency } = suite.repository();

            // Act
            const result = await concurrency.run({
                first: (transaction) =>
                    organizationService.revoke({
                        actor: organization.owner.account,
                        identifiers: [organization.id],
                        global: false,
                        transaction,
                    }),
                second: (transaction) =>
                    projectService.create({
                        input: {
                            organization: organization.id,
                            realm: organization.realm,
                            name: "Concurrent",
                            description: "",
                        },
                        transaction,
                    }),
            });
            const result1 = result.second.status;
            const result2 = result.first.realms;
            const result3 = await suite.transaction((transaction) =>
                transaction.count(Project, { organization: organization.id }),
            );
            const loaded = await suite.transaction((transaction) =>
                transaction.findOneOrFail(Organization, organization.id),
            );

            // Assert
            expect(result1).toBe("rejected");
            expect(result2).toEqual(expect.arrayContaining([{ realm: organization.realm }, { realm: existing.realm }]));
            expect(result3).toBe(1);
            expect(loaded.status).toBe(OrganizationStatus.REVOKED);
        });

        it("[case] - rejects organization revoke after concurrent creation starts a project bootstrap", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const { organizationService, projectService, concurrency } = suite.repository();

            // Act
            const result = await concurrency.run({
                first: (transaction) =>
                    projectService.create({
                        input: {
                            organization: organization.id,
                            realm: organization.realm,
                            name: "Concurrent",
                            description: "",
                        },
                        transaction,
                    }),
                second: (transaction) =>
                    organizationService.revoke({
                        actor: organization.owner.account,
                        identifiers: [organization.id],
                        global: false,
                        transaction,
                    }),
            });
            const result1 = result.second;
            const [loaded, project] = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.findOneOrFail(Organization, organization.id),
                    transaction.findOneOrFail(Project, result.first.id),
                ]),
            );

            // Assert
            expect(result1).toEqual({
                status: "rejected",
                reason: expect.objectContaining({
                    message: "services.workflow.OPERATION_PENDING",
                }),
            });
            expect(loaded.status).toBe(OrganizationStatus.ACTIVE);
            expect(project.status).toBe(ProjectStatus.PROVISIONING);
        });

        it.each(["confirmBootstrap", "rejectBootstrap"] as const)(
            "[case] - collects only existing realms after concurrent %s completes",
            async (operation) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const { organizationService, projectService, concurrency } = suite.repository();
                const project = await suite.transaction((transaction) =>
                    projectService.create({
                        input: {
                            organization: organization.id,
                            realm: organization.realm,
                            name: "Pending",
                            description: "",
                        },
                        transaction,
                    }),
                );

                // Act
                const result = await concurrency.run({
                    first: async (transaction) => {
                        await projectService[operation]({
                            actor: organization.owner.account,
                            realm: project.realm,
                            input: {
                                type: RealmType.PROJECT,
                                resource: project.id,
                                process: project.process!,
                                reason: "Rejected",
                            },
                            transaction,
                        });
                    },
                    second: (transaction) =>
                        organizationService.revoke({
                            actor: organization.owner.account,
                            identifiers: [organization.id],
                            global: false,
                            transaction,
                        }),
                });
                const realms =
                    operation === "confirmBootstrap"
                        ? [{ realm: organization.realm }, { realm: project.realm }]
                        : [{ realm: organization.realm }];
                const result1 = result.second;
                const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Project, project.id));

                // Assert
                expect(result1).toEqual({
                    status: "fulfilled",
                    value: {
                        organizations: [
                            expect.objectContaining({
                                id: organization.id,
                                status: OrganizationStatus.REVOKED,
                            }),
                        ],
                        realms,
                    },
                });
                expect(loaded.status).toBe(operation === "confirmBootstrap" ? ProjectStatus.ACTIVE : ProjectStatus.FAILED);
                expect(loaded.process).toBeNull();
            },
        );

        it.each(["confirmBootstrap", "rejectBootstrap"] as const)(
            "[case] - allows %s after a competing revoke is rejected",
            async (operation) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const { organizationService, projectService, concurrency } = suite.repository();
                const project = await suite.transaction((transaction) =>
                    projectService.create({
                        input: {
                            organization: organization.id,
                            realm: organization.realm,
                            name: "Pending",
                            description: "",
                        },
                        transaction,
                    }),
                );

                // Act
                const completion = await concurrency.run({
                    first: async (transaction) => {
                        const [result] = await Promise.allSettled([
                            organizationService.revoke({
                                actor: organization.owner.account,
                                identifiers: [organization.id],
                                global: false,
                                transaction,
                            }),
                        ]);
                        return result;
                    },
                    second: async (transaction) => {
                        await projectService[operation]({
                            actor: organization.owner.account,
                            realm: project.realm,
                            input: {
                                type: RealmType.PROJECT,
                                resource: project.id,
                                process: project.process!,
                                reason: "Rejected",
                            },
                            transaction,
                        });
                    },
                });
                const result = await suite.transaction((transaction) =>
                    organizationService.revoke({
                        actor: organization.owner.account,
                        identifiers: [organization.id],
                        global: false,
                        transaction,
                    }),
                );

                // Assert
                expect(completion.first.status).toBe("rejected");
                if (completion.first.status === "rejected") {
                    expect(completion.first.reason).toBeInstanceOf(Error);
                    expect(completion.first.reason.message).toContain("services.workflow.OPERATION_PENDING");
                }
                expect(completion.second.status).toBe("fulfilled");
                expect(result.realms).toEqual(
                    operation === "confirmBootstrap"
                        ? [{ realm: organization.realm }, { realm: project.realm }]
                        : [{ realm: organization.realm }],
                );
            },
        );
    });
});
