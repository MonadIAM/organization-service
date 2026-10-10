import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { InviteIntegrationHelpers } from "~testing/integration/domain-service/invite.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { InviteStatus, MembershipStatus } from "~context/enums";
import { Invite, Membership } from "~context/domain/entities";

const helpers = new InviteIntegrationHelpers();

describe("[DomainService] - Invite", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Behavior] - join workflow", () => {
        it("[case] - accepts an invite and creates its membership atomically", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const invitee = randomUUID();
            const invite = await suite.fixtures().createInvite({ organization, invitee, role: randomUUID() });

            // Act
            const result = await suite.transaction((transaction) =>
                suite.repository().inviteService.accept({
                    input: { invite: invite.id, invitee },
                    realm: organization.realm,
                    transaction,
                }),
            );
            const [loadedInvite, membershipCount] = await suite.transaction(
                async (transaction) =>
                    await Promise.all([
                        transaction.findOneOrFail(Invite, { id: invite.id }),
                        transaction.count(Membership, { id: result.membership.id, account: invitee }),
                    ]),
            );
            const result1 = loadedInvite.status;
            await suite.transaction((transaction) =>
                suite.repository().inviteService.confirmJoin({
                    actor: invite.inviter,
                    realm: organization.realm,
                    input: {
                        process: result.membership.process!,
                        command: result.membership.process!,
                        membership: result.membership.id,
                        account: invitee,
                        invite: invite.id,
                        assignment: randomUUID(),
                        role: invite.role!,
                        joinedAt: Date.now(),
                    },
                    transaction,
                }),
            );
            const result3 = await suite.transaction((transaction) =>
                transaction.count(Invite, { id: invite.id, status: InviteStatus.ACCEPTED }),
            );
            const result4 = await suite.transaction((transaction) =>
                transaction.count(Membership, { id: result.membership.id, status: MembershipStatus.ACTIVE }),
            );

            // Assert
            expect(result1).toBe("ACCEPTING");
            expect(membershipCount).toBe(1);
            expect(result3).toBe(1);
            expect(result4).toBe(1);
        });
    });
});
