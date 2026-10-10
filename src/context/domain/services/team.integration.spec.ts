import { describe, expect, it } from "@jest/globals";

import { TeamIntegrationHelpers } from "~testing/integration/domain-service/team.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { Team } from "~context/domain/entities";

const helpers = new TeamIntegrationHelpers();

describe("[DomainService] - Team", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Behavior] - team lifecycle", () => {
        it("[case] - creates and archives a team under an active department", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const department = await suite.fixtures().createDepartment({ organization });

            // Act
            const team = await suite.transaction((transaction) =>
                suite.repository().teamService.create({
                    input: { department: department.id, name: "Created", description: "Description" },
                    realm: organization.realm,
                    transaction,
                }),
            );
            await suite.transaction((transaction) =>
                suite.repository().teamService.archive({ identifiers: [team.id], realm: organization.realm, transaction }),
            );
            const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Team, { id: team.id }));

            // Assert
            expect(loaded.status).toBe("ARCHIVED");
        });
    });
});
