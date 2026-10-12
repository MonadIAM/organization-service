import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";

import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";
import { ProjectFixture } from "~testing/integration/repositories/project.fixture";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { ProjectStatus } from "~context/enums";

import { ProjectRepository } from "./project.repository";

describe("[Repository] - Project", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new ProjectRepository(readManager),
        fixture: (entityManager) => new ProjectFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted project through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const project = await suite.fixtures().createProject({
                description: "Mapping project description",
                name: "Mapping Project",
                organization,
            });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: project.id } });

            // Assert
            expect(loaded).toMatchObject({
                description: "Mapping project description",
                status: ProjectStatus.ACTIVE,
                createdAt: project.createdAt,
                version: project.version,
                name: "Mapping Project",
                realm: project.realm,
                id: project.id,
            });
            expect(loaded.organization.id).toBe(organization.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds projects by organization, name and status mapper filters", async () => {
            // Arrange
            const { organization, matched } = await suite.fixtures().filterScenario();

            // Act
            const [projects, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    organization: { operator: PublicLinkOperator.EQUAL, value: organization.id },
                    name: { operator: PublicStringOperator.ILIKE, value: "Alpha" },
                    status: { operator: PublicStringOperator.EQUAL, value: ProjectStatus.ACTIVE },
                },
            });
            const result = total;
            const result1 = projects.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });

    describe("[Method] - getLookupList", () => {
        it("[case] - uses trigram lookup scoped to organization", async () => {
            // Arrange
            const scenario = await suite.fixtures().lookupSearchScenario();

            // Act
            const [projects, total] = await suite.repository().getLookupList({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                organization: scenario.organization.id,
                term: scenario.term,
            });
            const result = total;
            const result1 = projects[0]?.id;
            const result2 = projects.map(({ name }) => name);

            // Assert
            expect(result).toBe(2);
            expect(result1).toBe(scenario.exact.id);
            expect(result2).toEqual(scenario.expectedNames);
            expect(projects[0]?.realm).toBe(scenario.exact.realm);
            expect(projects[0]?.realm).not.toBe(scenario.organization.realm);
        });
    });
});
