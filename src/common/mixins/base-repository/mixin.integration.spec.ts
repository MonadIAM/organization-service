import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";

import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { PublicStringOperator } from "~infrastructure/database/enums";
import { AuditLogMapper } from "~context/infrastructure/mappers";
import { ActionType, EntityType } from "~context/enums";
import { AuditLog } from "~common/transaction-manager";

import { BaseRepository } from "./mixin";

class TestRepository extends BaseRepository<SystemEntities.AuditLog, Repositories.Mappers.AuditLog.Types>({
    Mapper: AuditLogMapper,
    Entity: AuditLog,
}) {
    public constructor(protected readonly readManager: ORM.EntityManager) {
        super();
    }
}

describe("[Mixin] - BaseRepository", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new TestRepository(readManager),
        fixture: (entityManager) => new CoreFixture(entityManager),
    });

    describe("[Method] - findUnique", () => {
        it("[case] - finds one entity or null by ORM where query", async () => {
            // Arrange
            const auditLog = await suite.fixtures().createAuditLog();

            // Act
            const result = await suite.repository().findUnique({ where: { id: auditLog.id } });
            const result1 = await suite.repository().findUnique({
                where: { id: "00000000-0000-0000-0000-000000000000" },
            });

            // Assert
            expect(result).toMatchObject({
                id: auditLog.id,
                signature: "test-signature",
            });
            expect(result1).toBeNull();
        });
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - finds one required entity by ORM where query", async () => {
            // Arrange
            const auditLog = await suite.fixtures().createAuditLog({
                actionType: ActionType.UPDATE,
            });

            // Act
            const result = await suite.repository().findUniqueOrThrow({ where: { id: auditLog.id } });

            // Assert
            expect(result).toMatchObject({
                id: auditLog.id,
                actionType: ActionType.UPDATE,
            });
        });
    });

    describe("[Method] - find", () => {
        it("[case] - finds all entities matching an ORM where query", async () => {
            // Arrange
            await suite.fixtures().createAuditLog({ actionType: ActionType.CREATE });
            await suite.fixtures().createAuditLog({ actionType: ActionType.CREATE });
            await suite.fixtures().createAuditLog({ actionType: ActionType.DELETE });

            // Act
            const entries = await suite.repository().find({
                where: { actionType: ActionType.CREATE },
            });
            const result = entries;
            const result1 = entries.every(({ actionType }) => actionType === ActionType.CREATE);

            // Assert
            expect(result).toHaveLength(2);
            expect(result1).toBe(true);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds and counts entities using explicit ORM where and options", async () => {
            // Arrange
            await suite.fixtures().createAuditLog({ actionType: ActionType.CREATE });
            await suite.fixtures().createAuditLog({ actionType: ActionType.CREATE });

            // Act
            const [entries, total] = await suite.repository().findMany({
                options: { orderBy: { createdAt: QueryOrder.ASC } },
                where: { actionType: ActionType.CREATE },
            });

            // Assert
            expect(total).toBe(2);
            expect(entries).toHaveLength(2);
        });

        it("[case] - finds and counts entities using mapper filters, sort and pagination", async () => {
            // Arrange
            await suite.fixtures().createAuditLog({
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.CREATE,
            });
            await suite.fixtures().createAuditLog({
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.CREATE,
            });
            await suite.fixtures().createAuditLog({
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.UPDATE,
            });

            // Act
            const [entries, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 1 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    actionType: {
                        operator: PublicStringOperator.EQUAL,
                        value: ActionType.CREATE,
                    },
                },
            });

            // Assert
            expect(total).toBe(2);
            expect(entries).toHaveLength(1);
        });

        it("[case] - finds and counts entities using mapper filters combined with prefilter", async () => {
            // Arrange
            await suite.fixtures().createAuditLog({
                actionType: ActionType.CREATE,
                entityType: EntityType.ORGANIZATION,
            });
            await suite.fixtures().createAuditLog({
                actionType: ActionType.UPDATE,
                entityType: EntityType.ORGANIZATION,
            });

            // Act
            const [entries, total] = await suite.repository().findMany({
                prefilter: { entityType: EntityType.ORGANIZATION },
                filters: {
                    actionType: {
                        operator: PublicStringOperator.EQUAL,
                        value: ActionType.CREATE,
                    },
                },
                sort: { createdAt: QueryOrder.ASC },
                pagination: { currentPage: 1, elementsPerPage: 10 },
            });

            // Assert
            expect(total).toBe(1);
            expect(entries[0]?.actionType).toBe(ActionType.CREATE);
        });

        it("[case] - keeps mapper pagination stable when creation timestamps are equal", async () => {
            // Arrange
            const createdAt = new Date("2026-01-01T00:00:00.000Z");
            const first = await suite.fixtures().createAuditLog({ actionType: ActionType.DELETE, createdAt });
            const second = await suite.fixtures().createAuditLog({ actionType: ActionType.DELETE, createdAt });
            const third = await suite.fixtures().createAuditLog({ actionType: ActionType.DELETE, createdAt });
            const expectedIDs = [first, second, third]
                .sort((left, right) => left.id.localeCompare(right.id))
                .map(({ id }) => id);

            // Act
            const [firstPage, total] = await suite.repository().findMany({
                filters: { actionType: { operator: PublicStringOperator.EQUAL, value: ActionType.DELETE } },
                pagination: { currentPage: 1, elementsPerPage: 2 },
                sort: { createdAt: QueryOrder.ASC },
            });
            const [secondPage] = await suite.repository().findMany({
                filters: { actionType: { operator: PublicStringOperator.EQUAL, value: ActionType.DELETE } },
                pagination: { currentPage: 2, elementsPerPage: 2 },
                sort: { createdAt: QueryOrder.ASC },
            });
            const result = total;
            const result1 = [...firstPage, ...secondPage].map(({ id }) => id);

            // Assert
            expect(result).toBe(expectedIDs.length);
            expect(result1).toEqual(expectedIDs);
        });
    });
});
