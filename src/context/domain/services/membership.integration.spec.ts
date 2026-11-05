import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { MembershipIntegrationHelpers } from "~testing/integration/domain-service/membership.helpers";
import { ProjectAccountAssignment, Membership } from "~context/domain/entities";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { MembershipStatus } from "~context/enums";

const helpers = new MembershipIntegrationHelpers();

describe("[DomainService] - Membership", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Behavior] - HR membership ensure", () => {
        it.each(["new", "left", "active"] as const)("[case] - ensures membership from %s", async (state) => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const account = randomUUID();
            if (state !== "new") {
                const membership = await suite.fixtures().createMembership({ organization, account });
                if (state === "left") {
                    await suite.transaction(async (transaction) => {
                        const entity = await transaction.findOneOrFail(Membership, membership.id);
                        entity.leave();
                    });
                }
            }
            const request = {
                actor: randomUUID(),
                realm: organization.realm,
                input: { organization: organization.id, process: randomUUID(), account },
            };

            // Act
            const membership = await suite.transaction((transaction) =>
                suite.repository().membershipService.ensure({ ...request, transaction }),
            );
            if (state !== "active") {
                await suite.transaction((transaction) =>
                    suite.repository().membershipService.completeEnsure({
                        realm: organization.realm,
                        input: {
                            membership: membership.id,
                            assignment: randomUUID(),
                            hrRequest: request.input.process,
                            joinedAt: Date.now(),
                            process: membership.process!,
                            command: membership.process!,
                            role: randomUUID(),
                            account,
                        },
                        transaction,
                    }),
                );
            }

            // Assert
            await suite.transaction(async (transaction) => {
                const members = await transaction.find(Membership, { organization: organization.id, account });
                expect(members).toHaveLength(1);
                expect(members[0].status).toBe(MembershipStatus.ACTIVE);
                expect(members[0].process).toBeFalsy();
            });
        });

        it.each([MembershipStatus.BLOCKED, MembershipStatus.SUSPENDED] as const)(
            "[case] - does not bypass %s membership",
            async (status) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const membership = await suite.fixtures().createMembership({ organization });
                await suite.transaction(async (transaction) => {
                    const entity = await transaction.findOneOrFail(Membership, membership.id);
                    if (status === MembershipStatus.BLOCKED) {
                        entity.block();
                    } else {
                        entity.suspend();
                    }
                });

                // Act
                const result = suite.transaction((transaction) =>
                    suite.repository().membershipService.ensure({
                        input: { organization: organization.id, account: membership.account, process: randomUUID() },
                        realm: organization.realm,
                        actor: randomUUID(),
                        transaction,
                    }),
                );

                // Assert
                await expect(result).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
            },
        );

        it("[case] - rejects stale join confirmation and persists a correlated refusal", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const request = {
                input: { organization: organization.id, process: randomUUID(), account: randomUUID() },
                realm: organization.realm,
                actor: randomUUID(),
            };
            const membership = await suite.transaction((transaction) =>
                suite.repository().membershipService.ensure({ ...request, transaction }),
            );
            const input = {
                membership: membership.id,
                hrRequest: request.input.process,
                process: membership.process!,
                command: membership.process!,
                account: membership.account,
                reason: "role unavailable",
            };

            // Act
            await expect(
                suite.transaction((transaction) =>
                    suite.repository().membershipService.completeEnsure({
                        input: { ...input, process: randomUUID() },
                        realm: organization.realm,
                        transaction,
                    }),
                ),
            ).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
            await suite.transaction((transaction) =>
                suite.repository().membershipService.completeEnsure({ realm: organization.realm, input, transaction }),
            );

            // Assert
            await suite.transaction(async (transaction) => {
                const entity = await transaction.findOneOrFail(Membership, membership.id);
                expect(entity).toMatchObject({ status: MembershipStatus.LEFT, failure: "role unavailable" });
                expect(entity.process).toBeFalsy();
            });
        });
    });

    describe("[Behavior] - membership removal", () => {
        it.each([
            { operation: "leave", expectedStatus: MembershipStatus.LEFT },
            { operation: "block", expectedStatus: MembershipStatus.BLOCKED },
        ] as const)(
            "[case] - $operation changes membership status and cleans project assignments",
            async ({ operation, expectedStatus }) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const membership = await suite.fixtures().createMembership({ organization });
                const project = await suite.fixtures().createProject({ organization });
                const unrelatedProject = await suite.fixtures().createProject({ organization });
                await suite.fixtures().createProjectAccountAssignment({ membership, project });

                // Act
                const result = await suite.transaction((transaction) =>
                    suite.repository().membershipService[operation]({
                        account: membership.account,
                        identifiers: [membership.id],
                        realm: organization.realm,
                        transaction,
                    }),
                );
                const result1 = result.access.map(({ realm }) => realm).sort();
                const [loaded, projectCount] = await suite.transaction(
                    async (transaction) =>
                        await Promise.all([
                            transaction.findOneOrFail(Membership, { id: membership.id }),
                            transaction.count(ProjectAccountAssignment, { membership: { id: membership.id } }),
                        ]),
                );

                // Assert
                expect(result1).toEqual([organization.realm, project.realm, unrelatedProject.realm].sort());
                expect(loaded.status).toBe(expectedStatus);
                expect(projectCount).toBe(0);
            },
        );
    });

    describe("[Method] - resume", () => {
        it("[case] - rejects resume after leaving without bypassing the join process", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            await suite.transaction(async (transaction) => {
                const entity = await transaction.findOneOrFail(Membership, membership.id);
                entity.leave();
            });

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().membershipService.resume({
                    identifiers: [membership.id],
                    realm: organization.realm,
                    transaction,
                }),
            );
            await Promise.allSettled([result]);
            const result1 = await suite.transaction((transaction) =>
                transaction.count(Membership, { id: membership.id, status: MembershipStatus.LEFT }),
            );

            // Assert
            await expect(result).rejects.toThrow("CANNOT_ACTIVATE");
            expect(result1).toBe(1);
        });
    });

    describe("[Method] - join", () => {
        it("[case] - joins a new account into an active organization", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const account = randomUUID();

            // Act
            const membership = await suite.transaction((transaction) =>
                suite.repository().membershipService.join({
                    input: { organization: organization.id, account },
                    realm: organization.realm,
                    transaction,
                }),
            );
            const result = await suite.transaction((transaction) =>
                transaction.count(Membership, { id: membership.id, account }),
            );

            // Assert
            expect(result).toBe(1);
        });
    });
});
