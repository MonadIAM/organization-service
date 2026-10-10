import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";

import { ProjectAccountAssignmentFixture } from "~testing/integration/repositories/project-account-assignment.fixture";
import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { AssignmentStatus } from "~context/enums";

import { ProjectAccountAssignmentRepository } from "./project-account-assignment.repository";

describe("[Repository] - ProjectAccountAssignment", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new ProjectAccountAssignmentRepository(readManager),
        fixture: (entityManager) => new ProjectAccountAssignmentFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted project assignment through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            const project = await suite.fixtures().createProject({ organization });
            const assignment = await suite.fixtures().createProjectAccountAssignment({ membership, project });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: assignment.id } });

            // Assert
            expect(loaded).toMatchObject({
                status: AssignmentStatus.ACTIVE,
                assignedAt: assignment.assignedAt,
                assignedBy: assignment.assignedBy,
                version: assignment.version,
                id: assignment.id,
            });
            expect(loaded.organization.id).toBe(organization.id);
            expect(loaded.membership.id).toBe(membership.id);
            expect(loaded.project.id).toBe(project.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds project assignments by account, project and status mapper filters", async () => {
            // Arrange
            const { membership, project, matched } = await suite.fixtures().filterScenario();

            // Act
            const [assignments, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { assignedAt: QueryOrder.ASC },
                filters: {
                    account: { operator: PublicLinkOperator.EQUAL, value: membership.account },
                    project: { operator: PublicLinkOperator.EQUAL, value: project.id },
                    status: { operator: PublicStringOperator.EQUAL, value: AssignmentStatus.ACTIVE },
                },
            });
            const result = total;
            const result1 = assignments.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });
});
