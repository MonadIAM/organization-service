import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

import { OrganizationFixture } from "~testing/integration/repositories/organization.fixture";
import { Project, Membership, Invite, Department, Team } from "~context/domain/entities";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { PublicStringOperator } from "~infrastructure/database/enums";
import { OrganizationStatus } from "~context/enums";

import { OrganizationRepository } from "./organization.repository";

describe("[Repository] - Organization", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new OrganizationRepository(readManager),
        fixture: (entityManager) => new OrganizationFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted organization through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization({
                description: "Mapping organization description",
                title: "Mapping Organization",
            });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: organization.id } });

            // Assert
            expect(loaded).toMatchObject({
                description: "Mapping organization description",
                status: OrganizationStatus.ACTIVE,
                createdAt: organization.createdAt,
                version: organization.version,
                title: "Mapping Organization",
                realm: organization.realm,
                id: organization.id,
            });
            expect(loaded.owner.id).toBe(organization.owner.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds organizations by title and status mapper filters", async () => {
            // Arrange
            const { matched } = await suite.fixtures().filterScenario();

            // Act
            const [organizations, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    title: { operator: PublicStringOperator.ILIKE, value: "Alpha" },
                    status: { operator: PublicStringOperator.EQUAL, value: OrganizationStatus.ACTIVE },
                },
            });
            const result = total;
            const result1 = organizations.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });

    describe("[Method] - getLookupList", () => {
        it("[case] - uses trigram lookup with stable title tie-breakers", async () => {
            // Arrange
            const scenario = await suite.fixtures().lookupSearchScenario();

            // Act
            const [organizations, total] = await suite.repository().getLookupList({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                term: scenario.term,
            });
            const result = total;
            const result1 = organizations[0]?.id;
            const result2 = organizations.map(({ title }) => title);

            // Assert
            expect(result).toBe(2);
            expect(result1).toBe(scenario.exact.id);
            expect(result2).toEqual(scenario.expectedTitles);
            expect(organizations[0]?.realm).toBe(scenario.exact.realm);
        });
    });

    describe("[Method] - hasPendingProcesses", () => {
        it.each(["project", "membership", "invite", "department", "team"] as const)(
            "[case] - detects a pending %s process only in the requested organizations",
            async (target) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const foreign = await suite.fixtures().createOrganization();
                const project = await suite.fixtures().createProject({ organization });
                const invite = await suite.fixtures().createInvite({ organization });
                const department = await suite.fixtures().createDepartment({ organization });
                const team = await suite.fixtures().createTeam({ department });
                await suite.transaction(async (transaction) => {
                    const patch = { process: randomUUID() };
                    switch (target) {
                        case "project":
                            await transaction.nativeUpdate(Project, project.id, patch);
                            break;
                        case "membership":
                            await transaction.nativeUpdate(Membership, organization.owner.id, patch);
                            break;
                        case "invite":
                            await transaction.nativeUpdate(Invite, invite.id, patch);
                            break;
                        case "department":
                            await transaction.nativeUpdate(Department, department.id, patch);
                            break;
                        case "team":
                            await transaction.nativeUpdate(Team, team.id, patch);
                            break;
                    }
                });

                // Act
                const results = await suite.transaction((transaction) => {
                    const repository = suite.repository();
                    return Promise.all([
                        repository.hasPendingProcesses({ identifiers: [organization.id], transaction }),
                        repository.hasPendingProcesses({ identifiers: [foreign.id], transaction }),
                        repository.hasPendingProcesses({ identifiers: [foreign.id, organization.id], transaction }),
                        repository.hasPendingProcesses({ identifiers: [], transaction }),
                    ]);
                });

                // Assert
                expect(results).toEqual([true, false, true, false]);
            },
        );
    });
});
