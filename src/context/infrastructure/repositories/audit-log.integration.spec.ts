import { describe, expect, it } from "@jest/globals";
import { QueryOrder } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { PublicStringOperator } from "~infrastructure/database/enums";
import { ActionType, EntityType } from "~context/enums";

import { AuditLogRepository } from "./audit-log.repository";

describe("[Repository] - AuditLog", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new AuditLogRepository(readManager),
        fixture: (entityManager) => new CoreFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted audit log entry through the schema", async () => {
            // Arrange
            const realm = randomUUID();
            const actor = randomUUID();
            const auditLog = await suite.fixtures().createAuditLog({
                context: { ip: "10.20.30.40", userAgent: "mapping-agent" },
                input: { field: "mapping-input" },
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.UPDATE,
                actor,
                realm,
            });

            // Act
            const result = await suite.repository().findUniqueOrThrow({ where: { id: auditLog.id } });

            // Assert
            expect(result).toMatchObject({
                input: { field: "mapping-input" },
                keyVersion: auditLog.keyVersion,
                entityType: EntityType.ORGANIZATION,
                signature: auditLog.signature,
                createdAt: auditLog.createdAt,
                actionType: ActionType.UPDATE,
                userAgent: "mapping-agent",
                ip: "10.20.30.40",
                id: auditLog.id,
                actor,
                realm,
            });
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds audit log entries by action and entity mapper filters", async () => {
            // Arrange
            const matched = await suite.fixtures().createAuditLog({
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.CREATE,
            });
            await suite.fixtures().createAuditLog({
                entityType: EntityType.ORGANIZATION,
                actionType: ActionType.UPDATE,
            });

            // Act
            const [entries, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    actionType: {
                        operator: PublicStringOperator.EQUAL,
                        value: ActionType.CREATE,
                    },
                    entityType: {
                        operator: PublicStringOperator.EQUAL,
                        value: EntityType.ORGANIZATION,
                    },
                },
            });
            const result = total;
            const result1 = entries.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });
});
