import { describe, expect, it } from "@jest/globals";

import { InviteCommandsUnitHelpers } from "~testing/unit/command-services/invite.helpers";
import { KafkaTopic } from "~context/enums";

const ACTOR = "actor-account";
const ACCOUNT = "target-account";
const REALM = "realm-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const INCOMING: TransactionManager.Service.IncomingMessage = { consumerKey: "unit-consumer", event: "incoming-event" };
const helpers = new InviteCommandsUnitHelpers();

describe("[Commands] - Invite", () => {
    describe("[Method] - create", () => {
        it("[case] - sets the authenticated account as inviter", async () => {
            // Arrange
            const { commands, inviteService, transaction, run } = helpers.commands();
            const input = { organization: ID, invitee: ACCOUNT, role: "reader" };
            const invite = helpers.createInvite();
            inviteService.create.mockResolvedValue(invite);

            // Act
            await commands.create({ input, actor: ACTOR, realm: REALM, context: CONTEXT });

            // Assert
            expect(inviteService.create.mock.calls).toEqual([
                [{ input: { ...input, inviter: ACTOR }, realm: REALM, transaction: transaction.entityManager }],
            ]);
            expect(run.mock.calls).toEqual([
                [
                    expect.objectContaining({
                        outbox: expect.objectContaining({ destinationTopic: KafkaTopic.NOTIFICATION }),
                    }),
                ],
            ]);
        });
    });

    describe("[Behavior] - invite decisions", () => {
        it.each(["accept", "decline", "cancel"] as const)(
            "[case] - uses the actor as the correct party when processing %s",
            async (method) => {
                // Arrange
                const { commands, inviteService, transaction } = helpers.commands();

                // Act
                await commands[method]({ input: { invite: ID }, actor: ACTOR, realm: REALM, context: CONTEXT });

                // Assert
                expect(inviteService[method].mock.calls).toEqual([
                    [
                        {
                            input: { invite: ID, ...(method === "cancel" ? { inviter: ACTOR } : { invitee: ACTOR }) },
                            realm: REALM,
                            transaction: transaction.entityManager,
                        },
                    ],
                ]);
            },
        );
    });

    describe("[Method] - invalidate", () => {
        it("[case] - passes invalidation scope into the transaction", async () => {
            // Arrange
            const { commands, inviteService, transaction } = helpers.commands();
            const input = { organization: ID, account: ACCOUNT };

            // Act
            await commands.invalidate({ input, actor: ACTOR, realm: REALM, context: CONTEXT });

            // Assert
            expect(inviteService.invalidate.mock.calls).toEqual([
                [{ input, realm: REALM, transaction: transaction.entityManager }],
            ]);
        });
    });

    describe("[Method] - expire", () => {
        it.each([0, 2])("[case] - expires a batch of %i invitations and skips an empty transaction", async (count) => {
            // Arrange
            const { commands, inviteRepository, inviteService, transaction, run } = helpers.commands();
            const invites = Array.from({ length: count }, () => helpers.createInvite());
            const expirationDate = new Date("2026-01-01T00:00:00Z");
            inviteRepository.findExpiredPending.mockResolvedValue(invites);

            // Act
            const result = await commands.expire({ expirationDate, batchSize: 50 });

            // Assert
            expect(result).toBe(count);
            expect(inviteRepository.findExpiredPending.mock.calls).toEqual([[{ expirationDate, batchSize: 50 }]]);
            if (count) {
                expect(inviteService.expire.mock.calls).toEqual([
                    [{ entities: invites, at: expirationDate, transaction: transaction.entityManager }],
                ]);
            } else {
                expect(run).not.toHaveBeenCalled();
                expect(inviteService.expire).not.toHaveBeenCalled();
            }
        });
    });

    describe("[Method] - confirmJoin", () => {
        it("[case] - consumes confirmJoin with the original process and transaction", async () => {
            // Arrange
            const { commands, inviteService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: {
                    membership: ID,
                    assignment: "assignment-id",
                    joinedAt: 1000,
                    process: "process-id",
                    command: "command-id",
                    account: ACCOUNT,
                    invite: "invite-id",
                    role: "role-id",
                    reason: "Rejected",
                },
            };
            inviteService.confirmJoin.mockResolvedValue({ access: [] });

            // Act
            await commands.confirmJoin({ ...request, incoming: INCOMING });

            // Assert
            expect(inviteService.confirmJoin.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });

    describe("[Method] - rejectJoin", () => {
        it("[case] - consumes rejectJoin with the original process and transaction", async () => {
            // Arrange
            const { commands, inviteService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: {
                    membership: ID,
                    assignment: "assignment-id",
                    joinedAt: 1000,
                    process: "process-id",
                    command: "command-id",
                    account: ACCOUNT,
                    invite: "invite-id",
                    role: "role-id",
                    reason: "Rejected",
                },
            };
            inviteService.rejectJoin.mockResolvedValue(undefined);

            // Act
            await commands.rejectJoin({ ...request, incoming: INCOMING });

            // Assert
            expect(inviteService.rejectJoin.mock.calls).toEqual([[{ ...request, transaction: transaction.entityManager }]]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });
});
