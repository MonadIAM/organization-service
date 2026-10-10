import { describe, expect, it } from "@jest/globals";

import { DepartmentIntegrationHelpers } from "~testing/integration/domain-service/department.helpers";
import { Department, DepartmentClosure, Team } from "~context/domain/entities";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { MoveMode } from "~context/enums";

const helpers = new DepartmentIntegrationHelpers();
const pagination = { currentPage: 1, elementsPerPage: 100 };

describe("[DomainService] - Department", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Method] - create", () => {
        it("[case] - adopts multiple sibling subtrees under a new department", async () => {
            // Arrange
            const { organization, a, b, c, d } = await helpers.tree(suite);
            const sibling = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: { name: "Sibling", description: "", parent: a.id },
                }),
            );

            // Act
            const group = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: {
                        name: "Group",
                        description: "",
                        parent: a.id,
                        children: [b.id, sibling.id],
                    },
                }),
            );
            const repository = suite.repository().departmentRepository;
            const [grouped] = await repository.findDescendants({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                ancestor: group.id,
                pagination,
            });
            const result = grouped.map(({ id }) => id).sort();

            // Assert
            expect(result).toEqual([group.id, b.id, c.id, d.id, sibling.id].sort());
        });
    });

    describe("[Method] - move", () => {
        it("[case] - detaches multiple sibling subtrees when moving their parent without descendants", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await helpers.tree(suite);
            const sibling = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: { name: "Sibling", description: "", parent: a.id },
                }),
            );
            const group = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: {
                        name: "Group",
                        description: "",
                        parent: a.id,
                        children: [b.id, sibling.id],
                    },
                }),
            );
            const repository = suite.repository().departmentRepository;

            // Act
            await suite.transaction((transaction) =>
                suite.repository().departmentService.move({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    target: group.id,
                    targetParent: x.id,
                    mode: MoveMode.PARALLEL,
                }),
            );
            const [ancestors] = await repository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: d.id,
                pagination,
            });
            const result = ancestors.map(({ id, depth }) => [id, depth]);
            const [siblingAncestors] = await repository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: sibling.id,
                pagination,
            });
            const result1 = siblingAncestors.map(({ id }) => id);

            // Assert
            expect(result).toEqual([
                [a.id, 3],
                [b.id, 2],
                [c.id, 1],
                [d.id, 0],
            ]);
            expect(result1).toEqual([a.id, sibling.id]);
        });

        it.each([MoveMode.SUBTREE, MoveMode.PARALLEL])(
            "[case] - moves using %s while preserving teams and position references",
            async (mode) => {
                // Arrange
                const { organization, a, b, c, d, x } = await helpers.tree(suite);
                const team = await suite.fixtures().createTeam({ department: b });
                await suite.transaction(async (transaction) => {
                    const target = await transaction.findOneOrFail(Department, b.id);
                    target.managerPosition = x.id;
                });

                // Act
                await suite.transaction((transaction) =>
                    suite.repository().departmentService.move({
                        transaction,
                        organization: organization.id,
                        realm: organization.realm,
                        target: b.id,
                        targetParent: x.id,
                        mode,
                    }),
                );
                const [ancestors] = await suite.repository().departmentRepository.findAncestors({
                    filters: {},
                    populate: [],
                    organization: organization.id,
                    realm: organization.realm,
                    descendant: d.id,
                    pagination,
                });
                const result = ancestors.map(({ id }) => id);
                const [bAncestors] = await suite.repository().departmentRepository.findAncestors({
                    filters: {},
                    populate: [],
                    organization: organization.id,
                    realm: organization.realm,
                    descendant: b.id,
                    pagination,
                });
                const result1 = bAncestors.map(({ id }) => id);
                const references = await suite.transaction(async (transaction) => {
                    return {
                        managerPosition: (await transaction.findOneOrFail(Department, b.id)).managerPosition,
                        teamDepartment: (await transaction.findOneOrFail(Team, team.id)).department.id,
                    };
                });

                // Assert
                expect(result).toEqual(mode === MoveMode.SUBTREE ? [x.id, b.id, c.id, d.id] : [a.id, c.id, d.id]);
                expect(result1).toEqual([x.id, b.id]);
                expect(references.managerPosition).toBe(x.id);
                expect(references.teamDepartment).toBe(b.id);
            },
        );

        it("[case] - moves an independent department without its children", async () => {
            // Arrange
            const { organization, a, b, c, x } = await helpers.tree(suite);
            await suite.transaction((transaction) =>
                suite.repository().departmentService.move({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    target: b.id,
                    targetParent: null,
                    mode: MoveMode.SUBTREE,
                }),
            );

            // Act
            await suite.transaction((transaction) =>
                suite.repository().departmentService.move({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    target: b.id,
                    targetParent: x.id,
                    mode: MoveMode.PARALLEL,
                }),
            );
            const graph = await suite
                .repository()
                .departmentRepository.getHierarchyGraph({ organization: organization.id, realm: organization.realm });
            const result = graph.edges;
            const result1 = graph.edges;
            const [ancestors] = await suite.repository().departmentRepository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: c.id,
                pagination,
            });
            const result2 = ancestors.map(({ id }) => id);
            const [oldRoot] = await suite.repository().departmentRepository.findDescendants({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                ancestor: a.id,
                pagination,
            });
            const result3 = oldRoot.map(({ id }) => id);

            // Assert
            expect(result).toHaveLength(2);
            expect(result1).toEqual(expect.arrayContaining([expect.objectContaining({ source: x.id, target: b.id })]));
            expect(result2).toEqual([c.id]);
            expect(result3).toEqual([a.id]);
        });

        it("[case] - allows a parallel move below a former descendant after detaching children", async () => {
            // Arrange
            const { organization, a, b, c, d } = await helpers.tree(suite);

            // Act
            await suite.transaction((transaction) =>
                suite.repository().departmentService.move({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    target: b.id,
                    targetParent: d.id,
                    mode: MoveMode.PARALLEL,
                }),
            );
            const [ancestors] = await suite.repository().departmentRepository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: b.id,
                pagination,
            });
            const result = ancestors.map(({ id }) => id);

            // Assert
            expect(result).toEqual([a.id, c.id, d.id, b.id]);
        });
    });

    describe("[Method] - create", () => {
        it("[case] - inserts an intermediate level above selected child subtrees", async () => {
            // Arrange
            const { organization, a, b, c, d } = await helpers.tree(suite);

            // Act
            const inserted = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: {
                        name: "Inserted",
                        description: "",
                        parent: a.id,
                        children: [b.id, b.id],
                    },
                }),
            );
            const [ancestors] = await suite.repository().departmentRepository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: d.id,
                pagination,
            });
            const result = ancestors.map(({ id }) => id);

            // Assert
            expect(result).toEqual([a.id, inserted.id, b.id, c.id, d.id]);
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - removes an intermediate level without deleting descendant branches", async () => {
            // Arrange
            const { organization, a, b, c, d } = await helpers.tree(suite);
            const inserted = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: {
                        name: "Inserted",
                        description: "",
                        parent: a.id,
                        children: [b.id, b.id],
                    },
                }),
            );
            await suite.transaction(async (transaction) => {
                await suite.repository().departmentService.archive({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    identifiers: [inserted.id],
                });
            });

            // Act
            await suite.transaction(async (transaction) => {
                await suite.repository().departmentService.purge({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    id: inserted.id,
                });
            });
            const [after] = await suite.repository().departmentRepository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: d.id,
                pagination,
            });
            const result = after.map(({ id }) => id);

            // Assert
            expect(result).toEqual([a.id, b.id, c.id, d.id]);
        });
    });

    describe("[Method] - create", () => {
        it("[case] - groups selected independent departments under a new department", async () => {
            // Arrange
            const { organization, a, x } = await helpers.tree(suite);

            // Act
            const root = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: { name: "Group", description: "", children: [a.id, x.id] },
                }),
            );
            const graph = await suite.repository().departmentRepository.getHierarchyGraph({
                organization: organization.id,
                realm: organization.realm,
            });

            // Assert
            expect(graph.edges).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ source: root.id, target: a.id }),
                    expect.objectContaining({ source: root.id, target: x.id }),
                ]),
            );
            expect(graph.nodes).toHaveLength(6);
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - removes a grouping department while retaining all child hierarchies", async () => {
            // Arrange
            const { organization, a, x } = await helpers.tree(suite);
            const root = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    input: { name: "Group", description: "", children: [a.id, x.id] },
                }),
            );
            await suite.transaction(async (transaction) => {
                await suite.repository().departmentService.archive({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    identifiers: [root.id],
                });
            });

            // Act
            await suite.transaction(async (transaction) => {
                await suite.repository().departmentService.purge({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    id: root.id,
                });
            });
            const [ancestors] = await suite.repository().departmentRepository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: a.id,
                pagination,
            });
            const result = ancestors.map(({ id }) => id);
            const result1 = (
                await suite
                    .repository()
                    .departmentRepository.getHierarchyGraph({ organization: organization.id, realm: organization.realm })
            ).nodes;

            // Assert
            expect(result).toEqual([a.id]);
            expect(result1).toHaveLength(5);
        });
    });

    describe("[Method] - move", () => {
        it.each(["current parent", "self", "descendant", "foreign parent", "foreign target"] as const)(
            "[case] - rejects moving to %s without changing the hierarchy",
            async (scenario) => {
                // Arrange
                const { organization, a, b, c } = await helpers.tree(suite);
                const external = await suite.fixtures().createOrganization();
                const foreign = await suite.fixtures().createDepartment({ organization: external });
                const repository = suite.repository().departmentRepository;
                const scope = { organization: organization.id, realm: organization.realm };
                const before = await repository.getHierarchyGraph(scope);
                const targets = {
                    "current parent": a.id,
                    self: b.id,
                    descendant: c.id,
                    "foreign parent": foreign.id,
                    "foreign target": null,
                };
                const requestScope =
                    scenario === "foreign target" ? { organization: external.id, realm: external.realm } : scope;

                // Act
                const result = suite.transaction((transaction) =>
                    suite.repository().departmentService.move({
                        ...requestScope,
                        transaction,
                        target: b.id,
                        targetParent: targets[scenario],
                        mode: MoveMode.SUBTREE,
                    }),
                );
                await Promise.allSettled([result]);
                const result2 = await repository.getHierarchyGraph(scope);

                // Assert
                await expect(result).rejects.toThrow();
                expect(result2).toEqual(before);
            },
        );
    });

    describe("[Method] - create", () => {
        it.each(["indirect child", "unrelated department", "foreign child", "non-root", "foreign root"] as const)(
            "[case] - rejects adopting a %s and rolls back the new department",
            async (scenario) => {
                // Arrange
                const { organization, a, b, c, x } = await helpers.tree(suite);
                const external = await suite.fixtures().createOrganization();
                const foreign = await suite.fixtures().createDepartment({ organization: external });
                const repository = suite.repository().departmentRepository;
                const scope = { organization: organization.id, realm: organization.realm };
                const before = await repository.getHierarchyGraph(scope);
                const children = {
                    "indirect child": c.id,
                    "unrelated department": x.id,
                    "foreign child": foreign.id,
                    "non-root": b.id,
                    "foreign root": foreign.id,
                };
                const parent = scenario === "non-root" || scenario === "foreign root" ? undefined : a.id;

                // Act
                const result = suite.transaction((transaction) =>
                    suite.repository().departmentService.create({
                        ...scope,
                        transaction,
                        input: { name: "Invalid", description: "", parent, children: [children[scenario]] },
                    }),
                );
                await Promise.allSettled([result]);
                const result2 = await repository.getHierarchyGraph(scope);

                // Assert
                await expect(result).rejects.toThrow("CREATE_CHILD_NOT_DIRECT_DESCENDANT");
                expect(result2).toEqual(before);
            },
        );
    });

    describe("[Method] - purge", () => {
        it("[case] - rolls back reparenting when purge is blocked by a team's foreign key", async () => {
            // Arrange
            const { organization, b } = await helpers.tree(suite);
            await suite.fixtures().createTeam({ department: b });
            await suite.transaction((transaction) =>
                suite.repository().departmentService.archive({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    identifiers: [b.id],
                }),
            );
            const before = await suite
                .repository()
                .departmentRepository.getHierarchyGraph({ organization: organization.id, realm: organization.realm });

            // Act
            const result = suite.transaction((transaction) =>
                suite.repository().departmentService.purge({
                    transaction,
                    organization: organization.id,
                    realm: organization.realm,
                    id: b.id,
                }),
            );
            await Promise.allSettled([result]);
            const result2 = await suite
                .repository()
                .departmentRepository.getHierarchyGraph({ organization: organization.id, realm: organization.realm });

            // Assert
            await expect(result).rejects.toThrow();
            expect(result2).toEqual(before);
        });
    });

    describe("[Method] - move", () => {
        it("[case] - serializes concurrent opposing moves so that only one succeeds", async () => {
            // Arrange
            const { organization, a, x } = await helpers.tree(suite);

            // Act
            const results = await Promise.allSettled([
                suite.transaction((transaction) =>
                    suite.repository().departmentService.move({
                        transaction,
                        organization: organization.id,
                        realm: organization.realm,
                        target: a.id,
                        targetParent: x.id,
                        mode: MoveMode.SUBTREE,
                    }),
                ),
                suite.transaction((transaction) =>
                    suite.repository().departmentService.move({
                        transaction,
                        organization: organization.id,
                        realm: organization.realm,
                        target: x.id,
                        targetParent: a.id,
                        mode: MoveMode.SUBTREE,
                    }),
                ),
            ]);
            const result = results.filter(({ status }) => status === "fulfilled");
            const result1 = results.filter(({ status }) => status === "rejected");
            const pathCount = await suite.transaction(async (transaction) => {
                const paths = await transaction.find(DepartmentClosure, {
                    organization: organization.id,
                    ancestor: { id: a.id },
                    descendant: { id: x.id },
                });
                const inverse = await transaction.find(DepartmentClosure, {
                    organization: organization.id,
                    ancestor: { id: x.id },
                    descendant: { id: a.id },
                });
                return paths.length + inverse.length;
            });

            // Assert
            expect(result).toHaveLength(1);
            expect(result1).toHaveLength(1);
            expect(pathCount).toBe(1);
        });
    });

    describe("[Method] - create", () => {
        it("[case] - creates another independent department in an organization with existing hierarchies", async () => {
            // Arrange
            const { organization, a, x } = await helpers.tree(suite);
            const repository = suite.repository().departmentRepository;
            const scope = { organization: organization.id, realm: organization.realm };
            const before = await repository.getHierarchyGraph(scope);

            // Act
            const department = await suite.transaction((transaction) =>
                suite.repository().departmentService.create({
                    input: { name: "Independent", description: "Description" },
                    ...scope,
                    transaction,
                }),
            );
            const graph = await repository.getHierarchyGraph(scope);
            const result = department.organization.id;
            const result1 = graph.nodes.map(({ id }) => id);
            const result2 = graph.nodes;
            const result3 = graph.edges;
            const [ancestors] = await repository.findAncestors({
                ...scope,
                filters: {},
                populate: [],
                descendant: department.id,
                pagination,
            });
            const result4 = ancestors.map(({ id, depth }) => [id, depth]);

            // Assert
            expect(result).toBe(organization.id);
            expect(result1).toEqual(expect.arrayContaining([a.id, x.id, department.id]));
            expect(result2).toHaveLength(before.nodes.length + 1);
            expect(result3).toEqual(before.edges);
            expect(result4).toEqual([[department.id, 0]]);
        });
    });

    describe("[Method] - archive", () => {
        it("[case] - archives a department within the requested organization", async () => {
            // Arrange
            const { organization, b } = await helpers.tree(suite);

            // Act
            await suite.transaction((transaction) =>
                suite.repository().departmentService.archive({
                    identifiers: [b.id],
                    organization: organization.id,
                    realm: organization.realm,
                    transaction,
                }),
            );
            const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Department, b.id));

            // Assert
            expect(loaded.status).toBe("ARCHIVED");
        });
    });

    describe("[Method] - update", () => {
        it("[case] - updates a department when its organization belongs to the requested realm", async () => {
            // Arrange
            const { organization, b } = await helpers.tree(suite);

            // Act
            await suite.transaction((transaction) =>
                suite.repository().departmentService.update({
                    id: b.id,
                    organization: organization.id,
                    realm: organization.realm,
                    patch: { name: "Allowed" },
                    transaction,
                }),
            );
            const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Department, b.id));

            // Assert
            expect(loaded.name).toBe("Allowed");
        });
    });

    describe.each(["organization", "realm"] as const)("[Behavior] - scope mismatch: %s", (mismatch) => {
        it.each(["update", "changeManager", "create", "move", "archive", "restore", "purge"] as const)(
            "[case] - rejects %s and preserves department state",
            async (method) => {
                // Arrange
                const { organization, b, x } = await helpers.tree(suite);
                const external = await suite.fixtures().createOrganization();
                const service = suite.repository().departmentService;
                const scope = {
                    organization: mismatch === "organization" ? external.id : organization.id,
                    realm: external.realm,
                };
                const execute = (transaction: ORM.EntityManager): Promise<unknown> => {
                    const props = { ...scope, transaction };
                    switch (method) {
                        case "update":
                            return service.update({ ...props, id: b.id, patch: { name: "Foreign" } });
                        case "changeManager":
                            return service.changeManager({ ...props, id: b.id, position: null });
                        case "create":
                            return service.create({
                                ...props,
                                input: {
                                    parent: b.id,
                                    name: "Foreign",
                                    description: "",
                                },
                            });
                        case "move":
                            return service.move({
                                ...props,
                                target: b.id,
                                targetParent: x.id,
                                mode: MoveMode.SUBTREE,
                            });
                        case "archive":
                            return service.archive({ ...props, identifiers: [b.id] });
                        case "restore":
                            return service.restore({ ...props, identifiers: [b.id] });
                        case "purge":
                            return service.purge({ ...props, id: b.id });
                        default:
                            throw new Error(`Unknown mutation: ${method}`);
                    }
                };

                // Act
                const result = suite.transaction(execute);
                await Promise.allSettled([result]);
                const loaded = await suite.transaction((transaction) => transaction.findOneOrFail(Department, b.id));

                // Assert
                await expect(result).rejects.toThrow();
                expect(loaded.organization.id).toBe(organization.id);
                expect(loaded.name).toBe(b.name);
                expect(loaded.status).toBe(b.status);
            },
        );
    });
});
