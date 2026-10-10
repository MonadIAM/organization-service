import { describe, expect, it } from "@jest/globals";

import { OrganizationCommandsUnitHelpers } from "~testing/unit/command-services/organization.helpers";
import { KafkaTopic, RealmTopicAction, RealmType } from "~context/enums";

const ACTOR = "actor-account";
const ACCOUNT = "target-account";
const REALM = "realm-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const INCOMING: TransactionManager.Service.IncomingMessage = { consumerKey: "unit-consumer", event: "incoming-event" };
const helpers = new OrganizationCommandsUnitHelpers();

describe("[Commands] - Organization", () => {
    describe("[Method] - create", () => {
        it("[case] - creates in a transaction with the required ownership scope", async () => {
            // Arrange
            const { commands, organizationService, transaction, run } = helpers.commands();
            const input = { title: "New organization", description: "Description" };
            const created = { organization: helpers.createOrganization(), membership: helpers.createMembership() };
            organizationService.create.mockReturnValue(created);

            // Act
            await commands.create({ input, actor: ACTOR, context: CONTEXT });

            // Assert
            expect(organizationService.create.mock.calls).toEqual([
                [{ input, transaction: transaction.entityManager, actor: ACTOR }],
            ]);
            expect(run.mock.calls).toEqual([
                [expect.objectContaining({ changeLog: true, audit: expect.objectContaining({ actor: ACTOR, input }) })],
            ]);
        });
    });

    describe("[Behavior] - revocation lifecycle", () => {
        it.each([
            { method: "revoke", count: 1, global: false },
            { method: "revoke", count: 2, global: false },
            { method: "restore", count: 2, global: false },
            { method: "purge", count: 2, global: false },
            { method: "revoke", count: 1, global: true },
            { method: "restore", count: 1, global: true },
            { method: "purge", count: 1, global: true },
        ] as const)(
            "[case] - $method forwards global=$global and reports $count changed entities",
            async ({ method, count, global }) => {
                // Arrange
                const { commands, organizationService, transaction, run } = helpers.commands();
                const entities = Array.from({ length: count }, () => helpers.createOrganization());
                const input = { identifiers: [ID, "another-id", "unchanged-id"], reason: "Requested change" };
                organizationService[method].mockResolvedValue({ organizations: entities, realms: [{ realm: REALM }] });

                // Act
                const result = await commands[method]({ input, actor: ACTOR, context: CONTEXT, global });
                const result2 = organizationService[method].mock.calls;
                const result4 = result.params;
                const calls5 = run.mock.calls.slice();
                const result6 = await run.mock.results[0]?.value;

                // Assert
                expect(result2).toEqual([
                    [{ identifiers: input.identifiers, actor: ACTOR, global, transaction: transaction.entityManager }],
                ]);
                expect(result4).toEqual(count > 1 ? { count } : undefined);
                expect(calls5).toHaveLength(1);
                expect(result6).toEqual({
                    ...{ organizations: entities, realms: [{ realm: REALM }] },
                    actor: ACTOR,
                });
                expect(run.mock.calls).toEqual([
                    [
                        expect.objectContaining({
                            outbox: expect.objectContaining({
                                destinationTopic: KafkaTopic.REALM,
                                actionType:
                                    method === "restore"
                                        ? RealmTopicAction.SYSTEM_RESTORE
                                        : method === "purge"
                                          ? RealmTopicAction.SYSTEM_PURGE
                                          : RealmTopicAction.SYSTEM_REVOKE,
                            }),
                        }),
                    ],
                ]);
            },
        );
    });

    describe("[Method] - update", () => {
        it("[case] - updates only the patch within the requested realm", async () => {
            // Arrange
            const { commands, organizationService, transaction } = helpers.commands();
            const input = { patch: { title: "Renamed" }, reason: "Correction" };

            // Act
            await commands.update({ input, id: ID, realm: REALM, actor: ACTOR, context: CONTEXT });

            // Assert
            expect(organizationService.update.mock.calls).toEqual([
                [{ patch: input.patch, id: ID, realm: REALM, transaction: transaction.entityManager }],
            ]);
        });
    });

    describe("[Method] - revoke", () => {
        it("[case] - propagates a domain failure through the transaction", async () => {
            // Arrange
            const { commands, organizationService } = helpers.commands();
            const failure = new Error("domain rejected mutation");
            organizationService.revoke.mockRejectedValue(failure);

            // Act
            const result = commands.revoke({
                global: false,
                input: { identifiers: [ID], reason: "Requested change" },
                actor: ACTOR,
                context: CONTEXT,
            });

            // Assert
            await expect(result).rejects.toBe(failure);
        });
    });

    describe("[Method] - confirmBootstrap", () => {
        it("[case] - consumes confirmBootstrap with the original process and transaction", async () => {
            // Arrange
            const { commands, organizationService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: { type: RealmType.ORGANIZATION as const, resource: ID, process: "process-id", reason: "Rejected" },
            };
            organizationService.confirmBootstrap.mockResolvedValue({ realms: [] });

            // Act
            await commands.confirmBootstrap({ ...request, incoming: INCOMING });

            // Assert
            expect(organizationService.confirmBootstrap.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });

    describe("[Method] - rejectBootstrap", () => {
        it("[case] - consumes rejectBootstrap with the original process and transaction", async () => {
            // Arrange
            const { commands, organizationService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: { type: RealmType.ORGANIZATION as const, resource: ID, process: "process-id", reason: "Rejected" },
            };
            organizationService.rejectBootstrap.mockResolvedValue({ realms: [{ realm: REALM }] });

            // Act
            await commands.rejectBootstrap({ ...request, incoming: INCOMING });

            // Assert
            expect(organizationService.rejectBootstrap.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([
                [
                    expect.objectContaining({
                        incoming: INCOMING,
                        outbox: expect.objectContaining({
                            actionType: RealmTopicAction.SYSTEM_PURGE,
                            destinationTopic: KafkaTopic.REALM,
                        }),
                    }),
                ],
            ]);
        });
    });

    describe("[Method] - confirmTransfer", () => {
        it("[case] - consumes confirmTransfer with the original process and transaction", async () => {
            // Arrange
            const { commands, organizationService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: {
                    organization: ID,
                    previousOwner: ACTOR,
                    owner: ACCOUNT,
                    process: "process-id",
                    reason: "Rejected",
                },
            };
            organizationService.confirmTransfer.mockResolvedValue({ realms: [] });

            // Act
            await commands.confirmTransfer({ ...request, incoming: INCOMING });

            // Assert
            expect(organizationService.confirmTransfer.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });

    describe("[Method] - rejectTransfer", () => {
        it("[case] - consumes rejectTransfer with the original process and transaction", async () => {
            // Arrange
            const { commands, organizationService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: {
                    organization: ID,
                    previousOwner: ACTOR,
                    owner: ACCOUNT,
                    process: "process-id",
                    reason: "Rejected",
                },
            };
            organizationService.rejectTransfer.mockResolvedValue(undefined);

            // Act
            await commands.rejectTransfer({ ...request, incoming: INCOMING });

            // Assert
            expect(organizationService.rejectTransfer.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });

    describe("[Method] - transferOwnership", () => {
        it("[case] - binds an ownership transfer to the requested membership, realm and actor", async () => {
            // Arrange
            const { commands, organizationService, transaction, run } = helpers.commands();
            const transfer = { organization: helpers.createOrganization(), previousOwner: ACTOR, owner: ACCOUNT };
            organizationService.transferOwnership.mockResolvedValue(transfer);

            // Act
            await commands.transferOwnership({
                input: { membership: ID, reason: "New owner" },
                actor: ACTOR,
                realm: REALM,
                id: "organization-id",
                context: CONTEXT,
            });
            const result = organizationService.transferOwnership.mock.calls;
            const result2 = await run.mock.results[0]?.value;

            // Assert
            expect(result).toEqual([
                [{ membership: ID, id: "organization-id", realm: REALM, transaction: transaction.entityManager }],
            ]);
            expect(result2).toEqual({ ...transfer, actor: ACTOR });
            expect(run.mock.calls).toEqual([
                [
                    expect.objectContaining({
                        outbox: expect.objectContaining({ actionType: RealmTopicAction.TRANSFER_OWNERSHIP_REQUESTED }),
                    }),
                ],
            ]);
        });
    });
});
