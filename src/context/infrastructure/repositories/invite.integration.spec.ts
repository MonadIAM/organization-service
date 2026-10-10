import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";

import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";
import { InviteFixture } from "~testing/integration/repositories/invite.fixture";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { InviteStatus } from "~context/enums";

import { InviteRepository } from "./invite.repository";

describe("[Repository] - Invite", () => {
    const suite = postgresSuite({
        repository: ({ readManager, writeManager }) => new InviteRepository(readManager, writeManager),
        fixture: (entityManager) => new InviteFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted invite through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const expiresAt = new Date("2030-01-01T00:00:00.000Z");
            const invite = await suite.fixtures().createInvite({ organization, expiresAt });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: invite.id } });

            // Assert
            expect(loaded).toMatchObject({
                status: InviteStatus.PENDING,
                createdAt: invite.createdAt,
                version: invite.version,
                expiresAt,
                invitee: invite.invitee,
                inviter: invite.inviter,
                role: invite.role,
                id: invite.id,
            });
            expect(loaded.organization.id).toBe(organization.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds invites by organization, invitee and status mapper filters", async () => {
            // Arrange
            const { organization, matched } = await suite.fixtures().filterScenario();

            // Act
            const [invites, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    organization: { operator: PublicLinkOperator.EQUAL, value: organization.id },
                    invitee: { operator: PublicLinkOperator.EQUAL, value: matched.invitee },
                    status: { operator: PublicStringOperator.EQUAL, value: InviteStatus.PENDING },
                },
            });
            const result = total;
            const result1 = invites.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });

    describe("[Method] - findExpiredPending", () => {
        it("[case] - finds only expired pending invites", async () => {
            // Arrange
            const { expirationDate, expired } = await suite.fixtures().expirationScenario();

            // Act
            const invites = await suite.repository().findExpiredPending({ expirationDate, batchSize: 10 });
            const result = invites.map(({ id, expiresAt }) => ({ id, expiresAt }));

            // Assert
            expect(result).toEqual([{ id: expired.id, expiresAt: expired.expiresAt }]);
        });
    });
});
