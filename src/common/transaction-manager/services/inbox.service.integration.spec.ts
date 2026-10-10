import { describe, expect, it } from "@jest/globals";

import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";

import { InboxService } from "./inbox.service";
import { Inbox } from "../entities";

describe("[CommonService] - Inbox", () => {
    const suite = postgresSuite({
        repository: () => new InboxService(),
        fixture: (entityManager) => new CoreFixture(entityManager),
    });

    describe("[Method] - claim", () => {
        it("[case] - claims an event once per consumer", async () => {
            // Arrange
            const incoming: TransactionManager.Service.IncomingMessage = {
                consumerKey: "organization.placeholder.v1",
                event: "event-1",
                source: { topic: "source-topic", partition: 2, offset: "42" },
            };

            // Act
            const first = await suite.transaction((transaction) => suite.repository().claim({ transaction, incoming }));
            const duplicate = await suite.transaction((transaction) => suite.repository().claim({ transaction, incoming }));
            const anotherConsumer = await suite.transaction((transaction) =>
                suite.repository().claim({
                    transaction,
                    incoming: { ...incoming, consumerKey: "another-consumer.v1" },
                }),
            );
            const rows = await suite.transaction((transaction) =>
                transaction.find(Inbox, {}, { orderBy: { consumerKey: "asc" } }),
            );

            // Assert
            expect(first).toBe(true);
            expect(duplicate).toBe(false);
            expect(anotherConsumer).toBe(true);
            expect(rows).toHaveLength(2);
            expect(rows[0]).toEqual(
                expect.objectContaining({ event: "event-1", topic: "source-topic", partition: 2, offset: "42" }),
            );
        });
    });

    describe("[Method] - clean", () => {
        it("[case] - cleans one expired batch and keeps fresh entries", async () => {
            // Arrange
            const events = ["expired-1", "expired-2", "expired-3", "fresh"];
            for await (const event of events) {
                await suite.transaction((transaction) =>
                    suite.repository().claim({
                        transaction,
                        incoming: { consumerKey: "organization.placeholder.v1", event },
                    }),
                );
            }
            await suite.transaction(async (transaction) => {
                const rows = await transaction.find(Inbox, {});
                for (const row of rows) {
                    row.processedAt =
                        row.event === "fresh"
                            ? new Date("2999-01-01T00:00:00.000Z")
                            : new Date(`2026-01-0${Number(row.event.slice(-1))}T00:00:00.000Z`);
                }
            });

            // Act
            const cleaned = await suite.transaction((transaction) =>
                suite.repository().clean({
                    expirationDate: new Date("2026-02-01T00:00:00.000Z"),
                    batchSize: 2,
                    transaction,
                }),
            );
            const remaining = await suite.transaction((transaction) =>
                transaction.find(Inbox, {}, { orderBy: { processedAt: "asc" } }),
            );
            const result = cleaned;
            const result1 = remaining.map(({ event }) => event);

            // Assert
            expect(result).toBe(2);
            expect(result1).toEqual(["expired-3", "fresh"]);
        });
    });
});
