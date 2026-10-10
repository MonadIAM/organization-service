import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";

import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { TeamFixture } from "~testing/integration/repositories/team.fixture";
import { TeamStatus } from "~context/enums";

import { TeamRepository } from "./team.repository";

describe("[Repository] - Team", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new TeamRepository(readManager),
        fixture: (entityManager) => new TeamFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted team through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const department = await suite.fixtures().createDepartment({ organization });
            const team = await suite.fixtures().createTeam({
                description: "Mapping team description",
                name: "Mapping Team",
                department,
            });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: team.id } });

            // Assert
            expect(loaded).toMatchObject({
                description: "Mapping team description",
                status: TeamStatus.ACTIVE,
                createdAt: team.createdAt,
                version: team.version,
                name: "Mapping Team",
                id: team.id,
            });
            expect(loaded.organization.id).toBe(organization.id);
            expect(loaded.department.id).toBe(department.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds teams by organization, department, name and status mapper filters", async () => {
            // Arrange
            const { organization, department, matched } = await suite.fixtures().filterScenario();

            // Act
            const [teams, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    organization: { operator: PublicLinkOperator.EQUAL, value: organization.id },
                    department: { operator: PublicLinkOperator.EQUAL, value: department.id },
                    name: { operator: PublicStringOperator.ILIKE, value: "Alpha" },
                    status: { operator: PublicStringOperator.EQUAL, value: TeamStatus.ACTIVE },
                },
            });
            const result = total;
            const result1 = teams.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });

    describe("[Method] - getLookupList", () => {
        it("[case] - uses trigram lookup scoped to organization and department", async () => {
            // Arrange
            const scenario = await suite.fixtures().lookupSearchScenario();

            // Act
            const [teams, total] = await suite.repository().getLookupList({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                organization: scenario.organization.id,
                department: scenario.department.id,
                term: scenario.term,
            });
            const result = total;
            const result1 = teams[0]?.id;
            const result2 = teams.map(({ name }) => name);

            // Assert
            expect(result).toBe(2);
            expect(result1).toBe(scenario.exact.id);
            expect(result2).toEqual(scenario.expectedNames);
        });
    });
});
