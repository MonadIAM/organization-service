import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { AccountIntegrationHelpers } from "~testing/integration/domain-service/account.helpers";
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

const helpers = new AccountIntegrationHelpers();

describe("[DomainService] - Account", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Method] - purge", () => {
        it("[case] - purges owned organization graphs and only the account's links in foreign organizations", async () => {
            // Arrange
            const account = randomUUID();
            const owned = await suite.fixtures().createOrganization({ ownerAccount: account });
            const foreign = await suite.fixtures().createOrganization();
            const project = await suite.fixtures().createProject({ organization: owned });
            const department = await suite.fixtures().createDepartment({ organization: owned });
            const team = await suite.fixtures().createTeam({ department });
            await suite.fixtures().createInvite({ organization: owned });
            const projectAssignment = await suite
                .fixtures()
                .createProjectAccountAssignment({ membership: owned.owner, project });
            await suite.transaction(async (transaction) => {
                await Promise.all([
                    transaction.nativeUpdate(Project, project.id, { manager: projectAssignment.id }),
                    transaction.nativeUpdate(Department, department.id, { managerPosition: randomUUID() }),
                    transaction.nativeUpdate(Team, team.id, { leadPosition: randomUUID() }),
                ]);
            });
            const membership = await suite.fixtures().createMembership({ organization: foreign, account });
            const foreignProject = await suite.fixtures().createProject({ organization: foreign });
            const unrelatedProject = await suite.fixtures().createProject({ organization: foreign });
            await suite.fixtures().createProjectAccountAssignment({ membership, project: foreignProject });
            await suite.fixtures().createInvite({ organization: foreign, inviter: account });
            const untouchedInvite = await suite.fixtures().createInvite({ organization: foreign });

            // Act
            const result = await suite.transaction((transaction) =>
                suite.repository().accountService.purge({ account, transaction }),
            );
            const result1 = result.realms.map(({ realm }) => realm).sort();
            const result2 = result.access.map(({ realm }) => realm).sort();
            const result3 = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.count(Organization, { id: owned.id }),
                    transaction.count(Membership, { organization: owned.id }),
                    transaction.count(Project, { organization: owned.id }),
                    transaction.count(Department, { organization: owned.id }),
                    transaction.count(Team, { organization: owned.id }),
                    transaction.count(Invite, { organization: owned.id }),
                    transaction.count(ProjectAccountAssignment, { organization: owned.id }),
                    transaction.count(Membership, { account }),
                    transaction.count(ProjectAccountAssignment, { membership: { id: membership.id } }),
                ]),
            );
            const result4 = await suite.transaction((transaction) => transaction.count(Organization, { id: foreign.id }));
            const result5 = await suite.transaction((transaction) => transaction.count(Invite, { id: untouchedInvite.id }));

            // Assert
            expect(result1).toEqual([owned.realm, project.realm].sort());
            expect(result2).toEqual([foreign.realm, foreignProject.realm, unrelatedProject.realm].sort());
            expect(result3).toEqual(Array(9).fill(0));
            expect(result4).toBe(1);
            expect(result5).toBe(1);
        });

        it("[case] - rejects cleanup while ownership is being transferred to the account", async () => {
            // Arrange
            const account = randomUUID();
            const organization = await suite.fixtures().createOrganization();
            const membership = await suite.fixtures().createMembership({ organization, account });
            await suite.transaction(async (transaction) => {
                const entity = await transaction.findOneOrFail(Organization, organization.id);
                const candidate = await transaction.findOneOrFail(Membership, membership.id);
                entity.beginTransfer(candidate);
            });

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().accountService.purge({ account, transaction }),
            );
            await Promise.allSettled([result]);
            const result1 = await suite.transaction((transaction) => transaction.count(Membership, { id: membership.id }));
            const result2 = await suite.transaction((transaction) =>
                transaction.count(Organization, { id: organization.id }),
            );

            // Assert
            await expect(result).rejects.toThrow("services.account.TRANSFER_PENDING");
            expect(result1).toBe(1);
            expect(result2).toBe(1);
        });

        it("[case] - rejects cleanup during a project bootstrap without deleting owned data", async () => {
            // Arrange
            const account = randomUUID();
            const organization = await suite.fixtures().createOrganization({ ownerAccount: account });
            const project = await suite.fixtures().createProject({ organization });
            await suite.transaction(async (transaction) => {
                const entity = await transaction.findOneOrFail(Project, project.id);
                entity.beginBootstrap();
            });

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().accountService.purge({ account, transaction }),
            );
            await Promise.allSettled([result]);
            const result1 = await suite.transaction((transaction) =>
                Promise.all([
                    transaction.count(Organization, { id: organization.id }),
                    transaction.count(Project, { id: project.id }),
                ]),
            );

            // Assert
            await expect(result).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
            expect(result1).toEqual([1, 1]);
        });
    });
});
