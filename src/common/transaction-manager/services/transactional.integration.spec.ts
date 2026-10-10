import { AccessCacheTopicAction, InvalidationScope } from "@monadiam/shared";
import { describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { TransactionalHelper } from "~testing/integration/transaction-manager/transactional.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { ActionType, EntityType, KafkaTopic } from "~context/enums";

import { AuditLog, ChangeLog, Inbox, Outbox } from "../entities";

describe("[CommonService] - Transactional", () => {
    const helper = new TransactionalHelper();
    const suite = postgresSuite({
        repository: ({ orm }) => helper.createTransactionalServiceContext({ orm }),
        fixture: (entityManager) => new CoreFixture(entityManager),
    });

    const AUDIT_PROPS = {
        context: { ip: "127.0.0.1", userAgent: "transactional-integration" },
        actionType: ActionType.CREATE,
        entityType: EntityType.ORGANIZATION,
        actor: randomUUID(),
        realm: randomUUID(),
    };

    const INCOMING_MESSAGE = {
        source: { topic: "source-topic", partition: 0, offset: "42" },
        event: "00000000-0000-4000-8000-000000000001",
        consumerKey: "organization.placeholder.v1",
    };

    describe("[Method] - consume", () => {
        it("[case] - commits inbox and effects exactly once", async () => {
            // Arrange
            const executeDuplicate = jest.fn(() => Promise.reject(new Error("duplicate callback must not execute")));

            // Act
            const first = await suite.repository().service.consume({
                incoming: INCOMING_MESSAGE,
                audit: AUDIT_PROPS,
                execute: () => Promise.resolve(),
            });
            const duplicate = await suite.repository().service.consume({
                incoming: INCOMING_MESSAGE,
                audit: AUDIT_PROPS,
                execute: executeDuplicate,
            });
            const readManager = suite.repository().readManager;
            readManager.clear();
            const result = await readManager.count(Inbox, {});
            const result1 = await readManager.count(AuditLog, {});
            const result2 = await readManager.count(Outbox, { destinationTopic: KafkaTopic.AUDIT_LOG_ARCHIVE });

            // Assert
            expect(first).toEqual({ status: "processed", value: undefined });
            expect(duplicate).toEqual({ status: "duplicate" });
            expect(executeDuplicate).not.toHaveBeenCalled();
            expect(result).toBe(1);
            expect(result1).toBe(1);
            expect(result2).toBe(1);
        });

        it("[case] - rolls back a failed claim and allows redelivery", async () => {
            // Arrange
            const incoming = { ...INCOMING_MESSAGE, event: "00000000-0000-4000-8000-000000000002" };
            const failure = new Error("domain failed");

            // Act
            const result = suite.repository().service.consume({
                incoming,
                execute: () => Promise.reject(failure),
            });
            await Promise.allSettled([result]);
            const readManager = suite.repository().readManager;
            readManager.clear();
            const result1 = await readManager.count(Inbox, {});
            const result2 = await suite.repository().service.consume({ incoming, execute: () => Promise.resolve() });
            readManager.clear();
            const result3 = await readManager.count(Inbox, {});

            // Assert
            await expect(result).rejects.toBe(failure);
            expect(result1).toBe(0);
            expect(result2).toEqual({
                status: "processed",
                value: undefined,
            });
            expect(result3).toBe(1);
        });

        it("[case] - allows only one concurrent transaction to process an event", async () => {
            // Arrange
            const incoming = { ...INCOMING_MESSAGE, event: "00000000-0000-4000-8000-000000000003" };
            const execute = jest.fn(() => Promise.resolve());

            // Act
            const consume = (): TransactionManager.Service.Consume.Result<void> =>
                suite.repository().service.consume({ incoming, execute });
            const outcomes = await Promise.all([consume(), consume()]);
            const readManager = suite.repository().readManager;
            readManager.clear();
            const result = outcomes.map(({ status }) => status).sort();
            const result1 = await readManager.count(Inbox, {});

            // Assert
            expect(result).toEqual(["duplicate", "processed"]);
            expect(execute).toHaveBeenCalledTimes(1);
            expect(result1).toBe(1);
        });
    });

    describe("[Method] - run", () => {
        it("[case] - commits audit log and archive outbox in one trace", async () => {
            // Arrange

            // Act
            await suite.repository().service.run({
                audit: { ...AUDIT_PROPS, input: { password: "secret-value" } },
                execute: () => Promise.resolve(),
            });
            const readManager = suite.repository().readManager;
            readManager.clear();
            const auditLogs = await readManager.find(AuditLog, {});
            const result = auditLogs;
            const result1 = auditLogs[0];
            const result2 = await readManager.count(Outbox, { destinationTopic: KafkaTopic.AUDIT_LOG_ARCHIVE });
            const result3 = await readManager.count(ChangeLog, {});

            // Assert
            expect(result).toHaveLength(1);
            expect(result1).toEqual(
                expect.objectContaining({
                    input: { password: "masked:secret-value" },
                    signature: expect.stringContaining("signed:AuditLog:"),
                    keyVersion: 7,
                }),
            );
            expect(result2).toBe(1);
            expect(result3).toBe(0);
        });

        it("[case] - runs without audit context", async () => {
            // Arrange

            // Act
            await suite.repository().service.run({
                execute: () => Promise.resolve(),
            });

            // Assert
            await helper.expectNoTransactionRows(suite.repository().readManager);
        });

        it("[case] - does not execute domain code when audit signing fails", async () => {
            // Arrange
            const externalError = new Error("vault signing unavailable");
            const execute = jest.fn<(transaction: ORM.EntityManager) => void>();
            const logMaskingService = helper.createLogMaskingService({
                sign: () => Promise.reject(externalError),
            });
            const service = helper.createTransactionalServiceContext({
                orm: suite.repository().orm,
                logMaskingService,
            }).service;

            // Act
            const result = service.run({
                audit: AUDIT_PROPS,
                execute,
            });

            // Assert
            await expect(result).rejects.toBe(externalError);
            expect(execute).not.toHaveBeenCalled();
            await helper.expectNoTransactionRows(suite.repository().readManager);
        });
    });

    describe("[Method] - emit", () => {
        it("[case] - emits audit log, audit archive and outbox without change log", async () => {
            // Arrange

            // Act
            await suite.repository().service.emit({
                audit: { ...AUDIT_PROPS, input: { password: "rejected-secret" } },
                payload: { items: [{ scope: InvalidationScope.GLOBAL }] },
                actionType: AccessCacheTopicAction.INVALIDATE,
                destinationTopic: KafkaTopic.ACCESS_CACHE,
            });

            const readManager = suite.repository().readManager;
            readManager.clear();
            const auditLogs = await readManager.find(AuditLog, {});
            const result = await readManager.count(Outbox, { destinationTopic: KafkaTopic.AUDIT_LOG_ARCHIVE });

            const result2 = await readManager.count(Outbox, { destinationTopic: KafkaTopic.ACCESS_CACHE });

            const result3 = await readManager.count(ChangeLog, {});

            // Assert
            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0]).toEqual(
                expect.objectContaining({
                    input: { password: "masked:rejected-secret" },
                    signature: expect.stringContaining("signed:AuditLog:"),
                    keyVersion: 7,
                }),
            );
            expect(result).toBe(1);
            expect(result2).toBe(1);
            expect(result3).toBe(0);
        });

        it("[case] - preserves external dependency errors raised before transaction commit", async () => {
            // Arrange
            const externalError = new Error("schema registry unavailable");
            const outboxService = helper.createOutboxService({
                build: () => {
                    throw externalError;
                },
            });
            const service = helper.createTransactionalServiceContext({
                logMaskingService: helper.createLogMaskingService(),
                orm: suite.repository().orm,
                outboxService,
            }).service;

            // Act
            const result = service.emit({
                audit: AUDIT_PROPS,
                payload: { items: [{ scope: InvalidationScope.GLOBAL }] },
                actionType: AccessCacheTopicAction.INVALIDATE,
                destinationTopic: KafkaTopic.ACCESS_CACHE,
            });

            // Assert
            await expect(result).rejects.toBe(externalError);
            await helper.expectNoTransactionRows(suite.repository().readManager);
        });
    });

    describe("[Behavior] - payload consumption", () => {
        const props = {
            incoming: INCOMING_MESSAGE,
            audit: { ...AUDIT_PROPS, input: { password: "payload-secret" } },
            payload: { items: [{ scope: InvalidationScope.GLOBAL }] },
            actionType: AccessCacheTopicAction.INVALIDATE,
            destinationTopic: KafkaTopic.ACCESS_CACHE,
        } satisfies TransactionManager.Service.Consume.PayloadProps;

        it("[case] - commits the inbox, masked audit and payload exactly once", async () => {
            // Arrange
            const { service, readManager } = suite.repository();
            const first = await service.consume(props);
            const duplicate = await service.consume(props);

            // Act
            readManager.clear();
            const result = await readManager.count(Inbox, {});

            const result2 = await readManager.count(ChangeLog, {});

            const result3 = await readManager.count(Outbox, {});

            const result4 = await readManager.count(AuditLog, {});

            const audit = await readManager.findOneOrFail(AuditLog, { actor: AUDIT_PROPS.actor });
            const event = await readManager.findOneOrFail(Outbox, { destinationTopic: KafkaTopic.ACCESS_CACHE });

            // Assert
            expect(first).toEqual({ status: "processed", value: undefined });
            expect(duplicate).toEqual({ status: "duplicate" });
            expect(result).toBe(1);
            expect(result2).toBe(0);
            expect(result3).toBe(2);
            expect(result4).toBe(1);
            expect(audit.input).toEqual({ password: "masked:payload-secret" });
            expect(event.payload).toEqual(props.payload);
        });

        it("[case] - deduplicates concurrent payload deliveries", async () => {
            // Arrange
            const { service, readManager } = suite.repository();
            const outcomes = await Promise.all([service.consume(props), service.consume(props)]);

            // Act
            readManager.clear();
            const result2 = await readManager.count(Inbox, {});

            const result3 = await readManager.count(AuditLog, {});

            const result4 = await readManager.count(Outbox, {});

            // Assert
            expect(outcomes.map(({ status }) => status).sort()).toEqual(["duplicate", "processed"]);
            expect(result2).toBe(1);
            expect(result3).toBe(1);
            expect(result4).toBe(2);
        });

        it.each(["outbox", "audit"] as const)(
            "[case] - rolls back a failed %s and permits payload redelivery",
            async (stage) => {
                // Arrange
                const error = new Error("payload effects failed");
                const outboxService = helper.createOutboxService(
                    stage === "outbox"
                        ? {
                              buildAuditLogArchive: () => {
                                  throw error;
                              },
                          }
                        : {},
                );
                const logMaskingService = helper.createLogMaskingService(
                    stage === "audit"
                        ? {
                              sign: () => Promise.reject(error),
                          }
                        : {},
                );
                const { readManager, service } = suite.repository();
                const failing = helper.createTransactionalServiceContext({
                    orm: suite.repository().orm,
                    outboxService,
                    logMaskingService,
                }).service;

                // Act
                const result = failing.consume(props);
                await Promise.allSettled([result]);
                readManager.clear();
                const result2 = await readManager.count(Inbox, {});

                const result3 = await readManager.count(AuditLog, {});

                const result4 = await readManager.count(Outbox, {});

                const result5 = await readManager.count(ChangeLog, {});

                const result6 = await service.consume(props);

                readManager.clear();
                const result7 = await readManager.count(Inbox, {});

                const result8 = await readManager.count(AuditLog, {});

                const result9 = await readManager.count(Outbox, {});

                // Assert
                await expect(result).rejects.toBe(error);
                expect(result2).toBe(0);
                expect(result3).toBe(0);
                expect(result4).toBe(0);
                expect(result5).toBe(0);
                expect(result6).toEqual({ status: "processed", value: undefined });
                expect(result7).toBe(1);
                expect(result8).toBe(1);
                expect(result9).toBe(2);
            },
        );
    });
});
