import { ChangeSetType } from "@mikro-orm/postgresql";
import { describe, expect, it } from "@jest/globals";

import { DepartmentClosureFixture } from "~testing/integration/repositories/department-closure.fixture";
import { ExternalChanges } from "~infrastructure/database/utils/external-changes";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { DepartmentClosure } from "~context/domain/entities";

import { DepartmentClosureRepository } from "./department-closure.repository";

function pathKey(path: Entities.DepartmentClosure): string {
    return `${path.ancestor.id}:${path.descendant.id}:${path.depth}`;
}

describe("[Repository] - DepartmentClosure", () => {
    const suite = postgresSuite({
        repository: () => new DepartmentClosureRepository(),
        fixture: (manager) => new DepartmentClosureFixture(manager),
    });

    describe("[Method] - move", () => {
        it("[case] - preserves common ancestor paths and updates their depth during a subtree move", async () => {
            // Arrange
            const { organization, a, b, c, d } = await suite.fixtures().tree();

            // Act
            const { result, changes } = await suite.transaction(async (transaction) => {
                const closure = suite.repository();

                const result = await closure.move({
                    transaction,
                    organization: organization.id,
                    target: c.id,
                    newParent: a.id,
                });
                const changes = ExternalChanges.drain({ entityManager: transaction });

                return { result, changes };
            });
            const paths = await suite.transaction(async (transaction) => {
                const paths = await transaction.find(
                    DepartmentClosure,
                    { organization: organization.id, descendant: { id: d.id }, depth: { $gt: 0 } },
                    { orderBy: { depth: "DESC" } },
                );
                return paths;
            });
            const result1 = result.removedPaths.map(({ ancestor, descendant }) => [ancestor.id, descendant.id]);
            const result2 = result.removedPaths;
            const result3 = changes.filter(({ type }) => type === ChangeSetType.CREATE);
            const result4 = changes
                .filter(({ type }) => type === ChangeSetType.UPDATE)
                .map(({ payload }) => payload.depth)
                .sort();
            const result5 = paths.map(({ ancestor, depth }) => [ancestor.id, depth]);

            // Assert
            expect(result1).toEqual(
                expect.arrayContaining([
                    [b.id, c.id],
                    [b.id, d.id],
                ]),
            );
            expect(result2).toHaveLength(2);
            expect(result3).toHaveLength(0);
            expect(result4).toEqual([1, 2]);
            expect(result5).toEqual([
                [a.id, 2],
                [c.id, 1],
            ]);
        });
    });

    describe("[Method] - insertNewHierarchy", () => {
        it.each([true, false])("[case] - inserts inherited paths and self path; has parent: %s", async (hasParent) => {
            // Arrange
            const { organization, a, b } = await suite.fixtures().tree();
            const detached = await suite.fixtures().createDetachedDepartment(organization);

            // Act
            const { paths, changes } = await suite.transaction(async (transaction) => {
                await suite.repository().insertNewHierarchy({
                    organization: organization.id,
                    descendant: detached.id,
                    ancestor: hasParent ? b.id : undefined,
                    transaction,
                });

                const paths = await transaction.find(DepartmentClosure, { descendant: { id: detached.id } });
                const changes = ExternalChanges.drain({ entityManager: transaction });
                return { paths, changes };
            });
            const result = paths.map(pathKey).sort();
            const result1 = paths.every((path) => path.organization.id === organization.id);
            const result2 = changes.every(({ type }) => type === ChangeSetType.CREATE);

            // Assert
            expect(result).toEqual(
                [
                    `${detached.id}:${detached.id}:0`,
                    ...(hasParent ? [`${b.id}:${detached.id}:1`, `${a.id}:${detached.id}:2`] : []),
                ].sort(),
            );
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });

    describe("[Method] - move", () => {
        it("[case] - moves a subtree to another independent department", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await suite.fixtures().tree();

            // Act
            const moved = await suite.transaction(async (transaction) => {
                const props = { organization: organization.id, target: b.id, transaction };

                const moved = await suite.repository().move({ ...props, newParent: x.id });

                return moved;
            });
            const result = moved.removedPaths.map(({ ancestor, descendant }) => `${ancestor.id}:${descendant.id}`).sort();
            const result1 = moved.upsertedPaths
                .map(({ ancestor, descendant, depth }) => `${ancestor.id}:${descendant.id}:${depth}`)
                .sort();

            // Assert
            expect(result).toEqual([b, c, d].map((node) => `${a.id}:${node.id}`).sort());
            expect(result1).toEqual([b, c, d].map((node, i) => `${x.id}:${node.id}:${i + 1}`).sort());
        });

        it("[case] - promotes a subtree to an independent hierarchy", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await suite.fixtures().tree();

            // Act
            const paths = await suite.transaction(async (transaction) => {
                const props = { organization: organization.id, target: b.id, transaction };
                await suite.repository().move({ ...props, newParent: x.id });

                await suite.repository().move({ ...props, newParent: null });

                const paths = await transaction.find(
                    DepartmentClosure,
                    { organization: organization.id },
                    { refresh: true },
                );
                return paths;
            });
            const result = paths.map(pathKey).sort();

            // Assert
            expect(result).toEqual(
                [
                    ...[a, b, c, d, x].map((node) => `${node.id}:${node.id}:0`),
                    `${b.id}:${c.id}:1`,
                    `${b.id}:${d.id}:2`,
                    `${c.id}:${d.id}:1`,
                ].sort(),
            );
        });
    });

    describe("[Method] - moveSubtrees", () => {
        it.each(["attach", "detach"] as const)(
            "[case] - %s several independent hierarchies together",
            async (operation) => {
                // Arrange
                const { organization, a, b, c, d, x } = await suite.fixtures().tree();
                const sibling = await suite.fixtures().createDepartment({ organization });
                const expected = [
                    ...[a, b, c, d, x, sibling].map((node) => `${node.id}:${node.id}:0`),
                    `${a.id}:${b.id}:1`,
                    `${a.id}:${c.id}:2`,
                    `${a.id}:${d.id}:3`,
                    `${b.id}:${c.id}:1`,
                    `${b.id}:${d.id}:2`,
                    `${c.id}:${d.id}:1`,
                    ...(operation === "attach"
                        ? [
                              `${x.id}:${a.id}:1`,
                              `${x.id}:${b.id}:2`,
                              `${x.id}:${c.id}:3`,
                              `${x.id}:${d.id}:4`,
                              `${x.id}:${sibling.id}:1`,
                          ]
                        : []),
                ];

                // Act
                const paths = await suite.transaction(async (transaction) => {
                    const props = { organization: organization.id, children: [a.id, sibling.id], transaction };
                    if (operation === "detach") {
                        await suite.repository().moveSubtrees({ ...props, oldParent: null, newParent: x.id });
                    }

                    await suite.repository().moveSubtrees({
                        ...props,
                        oldParent: operation === "attach" ? null : x.id,
                        newParent: operation === "attach" ? x.id : null,
                    });

                    const paths = await transaction.find(
                        DepartmentClosure,
                        { organization: organization.id },
                        { refresh: true },
                    );
                    return paths;
                });
                const result = paths.map(pathKey).sort();

                // Assert
                expect(result).toEqual(expected.sort());
            },
        );

        it("[case] - moves selected sibling subtrees together and preserves their internal paths", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await suite.fixtures().tree();
            const sibling = await suite.fixtures().createDepartment({ organization });

            // Act
            const paths = await suite.transaction(async (transaction) => {
                await suite
                    .repository()
                    .move({ organization: organization.id, target: sibling.id, newParent: a.id, transaction });

                await suite.repository().moveSubtrees({
                    organization: organization.id,
                    oldParent: a.id,
                    newParent: x.id,
                    children: [b.id, sibling.id],
                    transaction,
                });

                const paths = await transaction.find(
                    DepartmentClosure,
                    { organization: organization.id },
                    { refresh: true },
                );
                return paths;
            });
            const result = paths.map(pathKey).sort();

            // Assert
            expect(result).toEqual(
                [
                    ...[a, b, c, d, x, sibling].map((node) => `${node.id}:${node.id}:0`),
                    `${x.id}:${b.id}:1`,
                    `${x.id}:${c.id}:2`,
                    `${x.id}:${d.id}:3`,
                    `${x.id}:${sibling.id}:1`,
                    `${b.id}:${c.id}:1`,
                    `${b.id}:${d.id}:2`,
                    `${c.id}:${d.id}:1`,
                ].sort(),
            );
        });
    });

    describe("[Method] - decreaseTransitiveDepth", () => {
        it("[case] - decreases only paths through the removed intermediate department", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await suite.fixtures().tree();

            // Act
            const { paths, changes } = await suite.transaction(async (transaction) => {
                await suite
                    .repository()
                    .decreaseTransitiveDepth({ organization: organization.id, department: b.id, transaction });

                const paths = await transaction.find(DepartmentClosure, { organization: organization.id });
                const changes = ExternalChanges.drain({ entityManager: transaction });
                return { paths, changes };
            });
            const result = paths.map(pathKey).sort();
            const result2 = changes.every(({ type }) => type === ChangeSetType.UPDATE);

            // Assert
            expect(result).toEqual(
                [
                    ...[a, b, c, d, x].map((node) => `${node.id}:${node.id}:0`),
                    `${a.id}:${b.id}:1`,
                    `${a.id}:${c.id}:1`,
                    `${a.id}:${d.id}:2`,
                    `${b.id}:${c.id}:1`,
                    `${b.id}:${d.id}:2`,
                    `${c.id}:${d.id}:1`,
                ].sort(),
            );
            expect(changes).toHaveLength(2);
            expect(result2).toBe(true);
        });
    });

    describe("[Method] - existsTransitivePath", () => {
        it.each(["self", "transitive", "inverse", "unrelated", "foreign organization"] as const)(
            "[case] - checks a %s path",
            async (scenario) => {
                // Arrange
                const { organization, a, b, d, x } = await suite.fixtures().tree();
                const external = await suite.fixtures().createOrganization();
                const cases = {
                    self: [organization.id, a.id, a.id, true],
                    transitive: [organization.id, a.id, d.id, true],
                    inverse: [organization.id, d.id, a.id, false],
                    unrelated: [organization.id, a.id, x.id, false],
                    "foreign organization": [external.id, a.id, b.id, false],
                } as const;
                const [scope, ancestor, descendant, expected] = cases[scenario];

                // Act
                const result = await suite.transaction((transaction) =>
                    suite.repository().existsTransitivePath({
                        organization: scope,
                        ancestor,
                        descendant,
                        transaction,
                    }),
                );

                // Assert
                expect(result).toBe(expected);
            },
        );
    });

    describe("[Method] - move", () => {
        it("[case] - rolls back closure changes with the caller's transaction", async () => {
            // Arrange
            const { organization, b, x } = await suite.fixtures().tree();
            const before = await suite.transaction(async (transaction) =>
                (await transaction.find(DepartmentClosure, { organization: organization.id })).map(pathKey).sort(),
            );
            const failure = new Error("rollback");

            // Act
            const result = suite.transaction(async (transaction) => {
                await suite
                    .repository()
                    .move({ organization: organization.id, target: b.id, newParent: x.id, transaction });
                throw failure;
            });
            await Promise.allSettled([result]);
            const after = await suite.transaction(async (transaction) =>
                (await transaction.find(DepartmentClosure, { organization: organization.id })).map(pathKey).sort(),
            );

            // Assert
            await expect(result).rejects.toBe(failure);
            expect(after).toEqual(before);
        });
    });

    describe("[Method] - insertNewHierarchy", () => {
        it("[case] - rejects closure references to a missing department", async () => {
            // Arrange
            const { organization, a } = await suite.fixtures().tree();
            const missing = "00000000-0000-4000-8000-000000000001";

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().insertNewHierarchy({
                    organization: organization.id,
                    ancestor: a.id,
                    descendant: missing,
                    transaction,
                }),
            );
            await Promise.allSettled([result]);
            const remaining = await suite.transaction((transaction) =>
                transaction.count(DepartmentClosure, { descendant: missing }),
            );

            // Assert
            await expect(result).rejects.toThrow();
            expect(remaining).toBe(0);
        });
    });
});
