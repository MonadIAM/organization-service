import { describe, expect, it } from "@jest/globals";

import { MembershipCommandsUnitHelpers } from "~testing/unit/command-services/membership.helpers";
import { KafkaTopic, RealmTopicAction } from "~context/enums";

const ACTOR = "actor-account";
const ACCOUNT = "target-account";
const REALM = "realm-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const helpers = new MembershipCommandsUnitHelpers();

describe("[Commands] - Membership", () => {
    describe("[Method] - join", () => {
        it("[case] - joins in a transaction with the required ownership scope", async () => {
            // Arrange
            const { commands, membershipService, transaction, run } = helpers.commands();
            const input = { organization: ID, account: ACCOUNT };
            const created = helpers.createMembership();
            membershipService.join.mockResolvedValue(created);

            // Act
            await commands.join({ input, actor: ACTOR, context: CONTEXT, realm: REALM });

            // Assert
            expect(membershipService.join.mock.calls).toEqual([
                [{ input, transaction: transaction.entityManager, realm: REALM }],
            ]);
            expect(run.mock.calls).toEqual([
                [expect.objectContaining({ changeLog: true, audit: expect.objectContaining({ actor: ACTOR, input }) })],
            ]);
        });
    });

    describe("[Behavior] - membership lifecycle", () => {
        it.each([
            { method: "suspend", count: 1 },
            { method: "suspend", count: 2 },
            { method: "resume", count: 2 },
            { method: "leave", count: 2 },
            { method: "block", count: 2 },
        ] as const)(
            "[case] - $method preserves realm scope and reports $count changed entities",
            async ({ method, count }) => {
                // Arrange
                const { commands, membershipService, transaction, run } = helpers.commands();
                const entities = Array.from({ length: count }, () => helpers.createMembership());
                const input = { identifiers: [ID, "another-id", "unchanged-id"], reason: "Requested change" };
                membershipService[method].mockResolvedValue({
                    memberships: entities,
                    access: [{ realm: REALM, account: ACCOUNT }],
                    assignments: { project: [] },
                });

                // Act
                const result = await commands[method]({ input, actor: ACTOR, realm: REALM, context: CONTEXT });
                const result2 = membershipService[method].mock.calls;
                const result4 = result.params;
                const calls5 = run.mock.calls.slice();
                const result6 = await run.mock.results[0]?.value;

                // Assert
                expect(result2).toEqual([
                    [
                        {
                            identifiers: input.identifiers,
                            realm: REALM,
                            transaction: transaction.entityManager,
                            ...(method === "leave" ? { account: ACTOR } : {}),
                        },
                    ],
                ]);
                expect(result4).toEqual(count > 1 ? { count } : undefined);
                expect(calls5).toHaveLength(1);
                expect(result6).toEqual({
                    ...{
                        memberships: entities,
                        access: [{ realm: REALM, account: ACCOUNT }],
                        assignments: { project: [] },
                    },
                    actor: ACTOR,
                });
                expect(run.mock.calls).toEqual([
                    [
                        expect.objectContaining({
                            outbox: expect.objectContaining({
                                destinationTopic: KafkaTopic.REALM,
                                actionType:
                                    method === "suspend"
                                        ? RealmTopicAction.ACCOUNT_ACCESS_REVOKE
                                        : method === "resume"
                                          ? RealmTopicAction.ACCOUNT_ACCESS_RESTORE
                                          : RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                            }),
                        }),
                    ],
                ]);
            },
        );
    });

    describe("[Method] - suspend", () => {
        it("[case] - propagates a domain failure through the transaction", async () => {
            // Arrange
            const { commands, membershipService } = helpers.commands();
            const failure = new Error("domain rejected mutation");
            membershipService.suspend.mockRejectedValue(failure);

            // Act
            const result = commands.suspend({
                input: { identifiers: [ID], reason: "Requested change" },
                actor: ACTOR,
                realm: REALM,
                context: CONTEXT,
            });

            // Assert
            await expect(result).rejects.toBe(failure);
        });
    });
});
