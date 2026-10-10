import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { ProjectAccountAssignmentIntegrationHelpers } from "~testing/integration/domain-service/project-account-assignment.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { ProjectAccountAssignment } from "~context/domain/entities";

const helpers = new ProjectAccountAssignmentIntegrationHelpers();

describe("[DomainService] - ProjectAccountAssignment", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Behavior] - assignment lifecycle", () => {
        it("[case] - creates and then cleans an assignment by membership", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization });
            const project = await suite.fixtures().createProject({ organization, realm: organization.realm });

            // Act
            const assignment = await suite.transaction((transaction) =>
                suite.repository().assignmentService.create({
                    input: { membership: membership.id, project: project.id },
                    actor: randomUUID(),
                    realm: organization.realm,
                    transaction,
                }),
            );
            await suite.transaction((transaction) =>
                suite.repository().assignmentService.clean({ memberships: [membership.id], transaction }),
            );
            const result = await suite.transaction((transaction) =>
                transaction.count(ProjectAccountAssignment, { id: assignment.id }),
            );

            // Assert
            expect(result).toBe(0);
        });
    });
});
