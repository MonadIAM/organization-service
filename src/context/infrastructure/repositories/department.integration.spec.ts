import { QueryOrder, wrap } from "@mikro-orm/postgresql";
import { describe, expect, it } from "@jest/globals";

import { DepartmentClosureFixture } from "~testing/integration/repositories/department-closure.fixture";
import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";
import { DepartmentQueries } from "~context/application/queries/department.queries";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { DepartmentStatus, QueryMode, ResponseViewType } from "~context/enums";
import { Department, DepartmentClosure } from "~context/domain/entities";

import { DepartmentRepository } from "./department.repository";

const pagination = { currentPage: 1, elementsPerPage: 100 };

describe("[Repository] - Department", () => {
    const suite = postgresSuite({
        repository: ({ readManager }) => new DepartmentRepository(readManager),
        fixture: (entityManager) => new DepartmentClosureFixture(entityManager),
    });

    describe("[Method] - findUniqueOrThrow", () => {
        it("[case] - maps the persisted department through the schema", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const department = await suite.fixtures().createDepartment({
                description: "Mapping department description",
                name: "Mapping Department",
                organization,
            });

            // Act
            const loaded = await suite.repository().findUniqueOrThrow({ where: { id: department.id } });

            // Assert
            expect(loaded).toMatchObject({
                description: "Mapping department description",
                status: DepartmentStatus.ACTIVE,
                createdAt: department.createdAt,
                version: department.version,
                name: "Mapping Department",
                id: department.id,
            });
            expect(loaded.organization.id).toBe(organization.id);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - finds departments by organization, name and status mapper filters", async () => {
            // Arrange
            const { organization, matched } = await suite.fixtures().filterScenario();

            // Act
            const [departments, total] = await suite.repository().findMany({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: { createdAt: QueryOrder.ASC },
                filters: {
                    organization: { operator: PublicLinkOperator.EQUAL, value: organization.id },
                    name: { operator: PublicStringOperator.ILIKE, value: "Alpha" },
                    status: { operator: PublicStringOperator.EQUAL, value: DepartmentStatus.ACTIVE },
                },
            });
            const result = total;
            const result1 = departments.map(({ id }) => id);

            // Assert
            expect(result).toBe(1);
            expect(result1).toEqual([matched.id]);
        });
    });

    describe("[Behavior] - scoped reads", () => {
        it.each(["list", "lookup"] as const)(
            "[case] - keeps the ordinary %s inside the requested organization",
            async (method) => {
                // Arrange
                const organization = await suite.fixtures().createOrganization();
                const external = await suite.fixtures().createOrganization();
                const own = await suite.fixtures().createDepartment({ organization });
                await suite.fixtures().createDepartment({ organization: external });
                const queries = new DepartmentQueries(suite.repository());
                const props = {
                    mode: QueryMode.DEFAULT,
                    view: ResponseViewType.COMPACT,
                    organization: organization.id,
                    realm: organization.realm,
                    pagination: { currentPage: 1, elementsPerPage: 10 },
                    sort: {},
                } as const;

                // Act
                const [departments, total] =
                    method === "list"
                        ? await queries.findMany({ ...props, filters: {} })
                        : await queries.getLookupList({ ...props, term: "" });
                const result = departments.map(({ id }) => id);

                // Assert
                expect(result).toEqual([own.id]);
                expect(total).toBe(1);
            },
        );
    });

    describe("[Method] - findMany", () => {
        it.each([true, false])("[case] - supports management lists with organization filter: %s", async (filtered) => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const external = await suite.fixtures().createOrganization();
            const own = await suite.fixtures().createDepartment({ organization });
            const foreign = await suite.fixtures().createDepartment({ organization: external });
            const queries = new DepartmentQueries(suite.repository());
            const props = {
                mode: QueryMode.MANAGE,
                view: ResponseViewType.COMPACT,
                pagination: { currentPage: 1, elementsPerPage: 10 },
                sort: {},
            } as const;
            const filters = filtered ? { organization: { operator: PublicLinkOperator.EQUAL, value: external.id } } : {};
            const expected = filtered ? [foreign.id] : [own.id, foreign.id];

            // Act
            const [departments, total] = await queries.findMany({ ...props, filters });
            const result = departments.map(({ id }) => id).sort();

            // Assert
            expect(result).toEqual(expected.sort());
            expect(total).toBe(expected.length);
        });
    });

    describe("[Method] - getLookupList", () => {
        it("[case] - uses trigram lookup scoped to organization", async () => {
            // Arrange
            const scenario = await suite.fixtures().lookupSearchScenario();

            // Act
            const [departments, total] = await suite.repository().getLookupList({
                pagination: { currentPage: 1, elementsPerPage: 10 },
                organization: scenario.organization.id,
                realm: scenario.organization.realm,
                term: scenario.term,
            });
            const result = total;
            const result1 = departments[0]?.id;
            const result2 = departments.map(({ name }) => name);

            // Assert
            expect(result).toBe(2);
            expect(result1).toBe(scenario.exact.id);
            expect(result2).toEqual(scenario.expectedNames);
        });
    });
    describe("[Method] - getHierarchyGraph", () => {
        it("[case] - returns the graph of all independent hierarchies", async () => {
            // Arrange
            const { organization, a, b, c, d, x } = await suite.fixtures().tree();
            const repository = suite.repository();

            // Act
            const graph = await repository.getHierarchyGraph({ organization: organization.id, realm: organization.realm });
            const result = graph.nodes.map(({ id }) => id).sort();
            const result1 = graph.nodes.find(({ id }) => id === a.id);

            // Assert
            expect(result).toEqual([a.id, b.id, c.id, d.id, x.id].sort());
            expect(result1).toEqual({
                id: a.id,
                label: a.name,
                attributes: { status: a.status },
            });
            expect(graph.edges).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ source: a.id, target: b.id }),
                    expect.objectContaining({ source: b.id, target: c.id }),
                    expect.objectContaining({ source: c.id, target: d.id }),
                ]),
            );
            expect(graph.edges).toHaveLength(3);
        });
    });

    describe("[Method] - findAncestors", () => {
        it("[case] - returns ancestors including the selected department", async () => {
            // Arrange
            const { organization, a, b, c, d } = await suite.fixtures().tree();
            const repository = suite.repository();

            // Act
            const [ancestors] = await repository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: d.id,
                pagination,
            });
            const result = ancestors.map(({ id, depth }) => [id, depth]);

            // Assert
            expect(result).toEqual([
                [a.id, 3],
                [b.id, 2],
                [c.id, 1],
                [d.id, 0],
            ]);
        });
    });

    describe("[Method] - findDescendants", () => {
        it("[case] - returns descendants in descending depth order", async () => {
            // Arrange
            const { organization, b, c, d } = await suite.fixtures().tree();
            const repository = suite.repository();

            // Act
            const [children, count] = await repository.findDescendants({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                ancestor: b.id,
                pagination,
            });
            const result = children.map(({ id, depth }) => [id, depth]);

            // Assert
            expect(result).toEqual([
                [d.id, 2],
                [c.id, 1],
                [b.id, 0],
            ]);
            expect(count).toBe(3);
        });
    });

    describe("[Method] - findAncestors", () => {
        it("[case] - returns the selected independent department as its own ancestor", async () => {
            // Arrange
            const { organization, a } = await suite.fixtures().tree();
            const repository = suite.repository();

            // Act
            const [roots] = await repository.findAncestors({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                descendant: a.id,
                pagination,
            });
            const result = roots.map(({ id, depth }) => [id, depth]);

            // Assert
            expect(result).toEqual([[a.id, 0]]);
        });
    });

    describe("[Method] - findDescendants", () => {
        it("[case] - paginates descendants while reporting the full count", async () => {
            // Arrange
            const { organization, a, b } = await suite.fixtures().tree();
            const repository = suite.repository();

            // Act
            const [page, total] = await repository.findDescendants({
                filters: {},
                populate: [],
                organization: organization.id,
                realm: organization.realm,
                ancestor: a.id,
                pagination: { currentPage: 2, elementsPerPage: 2 },
            });
            const result = page.map(({ id }) => id);

            // Assert
            expect(result).toEqual([b.id, a.id]);
            expect(total).toBe(4);
        });
    });

    describe("[Behavior] - scoped reads", () => {
        it.each(["ancestors", "descendants"] as const)(
            "[case] - filters returned %s before pagination and honors custom populate",
            async (direction) => {
                // Arrange
                const { organization, a, b, c, d } = await suite.fixtures().tree();
                await suite.transaction(async (transaction) => {
                    await transaction.nativeUpdate(Department, { id: b.id }, { name: "Selected B" });
                    await transaction.nativeUpdate(Department, { id: c.id }, { name: "Selected C" });
                    await transaction.nativeUpdate(
                        Department,
                        { id: d.id },
                        {
                            name: "Selected D",
                            status: DepartmentStatus.ARCHIVED,
                        },
                    );
                });
                const repository = suite.repository();
                const props = {
                    organization: organization.id,
                    realm: organization.realm,
                    pagination: { currentPage: 1, elementsPerPage: 1 },
                    filters: {
                        name: { operator: PublicStringOperator.ILIKE, value: "Selected" },
                        status: { operator: PublicStringOperator.EQUAL, value: DepartmentStatus.ACTIVE },
                    },
                };

                // Act
                const read = (
                    populate: readonly ORM.EntityKey<Entities.Department>[],
                ): Repositories.Department.FindAncestors.Result =>
                    direction === "ancestors"
                        ? repository.findAncestors({ ...props, descendant: d.id, populate })
                        : repository.findDescendants({ ...props, ancestor: a.id, populate });
                const expected = direction === "ancestors" ? b : c;
                const [compact, compactTotal] = await read([]);
                const [detailed, detailedTotal] = await read(["organization"]);
                const result = compactTotal;
                const result2 = compact.map(({ id, depth }) => [id, depth]);
                const result3 = detailed.map(({ id }) => id);
                const result4 = wrap(compact[0]!.organization).isInitialized();
                const result5 = wrap(detailed[0]!.organization).isInitialized();

                // Assert
                expect(result).toBe(2);
                expect(detailedTotal).toBe(2);
                expect(result2).toEqual([[expected.id, 2]]);
                expect(result3).toEqual([expected.id]);
                expect(result4).toBe(false);
                expect(result5).toBe(true);
                expect(detailed[0]!.organization.title).toBe(organization.title);
            },
        );
    });

    describe.each(["ancestors", "descendants"] as const)("[Behavior] - %s queries", (direction) => {
        it.each(["all", "self", "direct", "filter", "limit", "refresh"] as const)(
            "[case] - honors the %s query",
            async (scenario) => {
                // Arrange
                const { organization, a, b, c, d } = await suite.fixtures().tree();
                const repository = suite.repository();
                const expected = {
                    all: direction === "ancestors" ? [a.id, b.id, c.id, d.id] : [d.id, c.id, b.id, a.id],
                    self: [direction === "ancestors" ? d.id : a.id],
                    direct: [direction === "ancestors" ? c.id : b.id],
                    filter: [b.id],
                    limit: [direction === "ancestors" ? a.id : d.id],
                    refresh: [direction === "ancestors" ? a.id : d.id],
                };

                // Act
                const entities = await suite.transaction(async (transaction) => {
                    const where: ORM.FilterQuery<Entities.Department> = { organization: organization.id };
                    const options: ORM.FindOptions<Entities.DepartmentClosure> = {};
                    const depth = scenario === "self" ? 0 : scenario === "direct" ? 1 : undefined;
                    if (scenario === "filter") {
                        where.name = b.name;
                    }
                    if (scenario === "limit") {
                        options.limit = 1;
                    }
                    if (scenario === "refresh") {
                        const target = direction === "ancestors" ? a : d;
                        await transaction.findOneOrFail(Department, target.id);
                        await transaction.nativeUpdate(Department, { id: target.id }, { name: "Refreshed" });
                        where.id = target.id;
                        options.refresh = true;
                    }

                    const entities =
                        direction === "ancestors"
                            ? await repository.getAncestors({ descendant: d.id, transaction, where, options, depth })
                            : await repository.getDescendants({ ancestor: a.id, transaction, where, options, depth });

                    return entities;
                });
                const result = entities.map(({ id }) => id);

                // Assert
                expect(result).toEqual(expected[scenario]);
                if (scenario === "refresh") {
                    expect(entities[0]?.name).toBe("Refreshed");
                }
            },
        );
    });

    describe("[Method] - getHierarchyGraph", () => {
        it("[case] - returns an empty graph when there are no departments", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();

            // Act
            const graph = await suite
                .repository()
                .getHierarchyGraph({ organization: organization.id, realm: organization.realm });

            // Assert
            expect(graph).toEqual({ nodes: [], edges: [] });
        });

        it("[case] - reads an uncommitted hierarchy through the caller's transaction", async () => {
            // Arrange
            const organization = await suite.fixtures().createOrganization();
            const repository = suite.repository();

            // Act
            const { graph, root, child } = await suite.transaction(async (transaction) => {
                const root = new Department({ organization, name: "Root", description: "" });
                const child = new Department({ organization, name: "Child", description: "" });
                transaction.persist([
                    root,
                    child,
                    new DepartmentClosure({ organization, ancestor: root, descendant: root, depth: 0 }),
                    new DepartmentClosure({ organization, ancestor: child, descendant: child, depth: 0 }),
                    new DepartmentClosure({ organization, ancestor: root, descendant: child, depth: 1 }),
                ]);
                await transaction.flush();

                const graph = await repository.getHierarchyGraph({
                    organization: organization.id,
                    realm: organization.realm,
                    transaction,
                });

                return { graph, root, child };
            });
            const result = graph.nodes.map(({ id }) => id).sort();

            // Assert
            expect(result).toEqual([root.id, child.id].sort());
            expect(graph.edges).toEqual([{ id: `edge_${root.id}_${child.id}`, source: root.id, target: child.id }]);
        });
    });

    describe("[Behavior] - scoped reads", () => {
        it.each(["graph", "ancestors", "descendants"] as const)(
            "[case] - isolates %s reads between organizations",
            async (method) => {
                // Arrange
                const { b } = await suite.fixtures().tree();
                const external = await suite.fixtures().createOrganization();
                const repository = suite.repository();
                const props = { organization: external.id, realm: external.realm, filters: {}, populate: [], pagination };

                // Act
                const result =
                    method === "graph"
                        ? await repository.getHierarchyGraph(props)
                        : method === "ancestors"
                          ? await repository.findAncestors({ ...props, descendant: b.id })
                          : await repository.findDescendants({ ...props, ancestor: b.id });

                // Assert
                expect(result).toEqual(method === "graph" ? { nodes: [], edges: [] } : [[], 0]);
            },
        );

        it.each(["ancestors", "descendants"] as const)(
            "[case] - isolates transactional %s reads between organizations",
            async (direction) => {
                // Arrange
                const { b } = await suite.fixtures().tree();
                const external = await suite.fixtures().createOrganization();
                const repository = suite.repository();
                const where = { organization: external.id };

                // Act
                const result = await suite.transaction((transaction) =>
                    direction === "ancestors"
                        ? repository.getAncestors({ where, descendant: b.id, transaction })
                        : repository.getDescendants({ where, ancestor: b.id, transaction }),
                );

                // Assert
                expect(result).toEqual([]);
            },
        );
    });

    describe.each(["matching", "foreign"] as const)("[Behavior] - organization realm: %s", (scope) => {
        it.each(["single", "list", "lookup", "ancestors", "descendants", "graph"] as const)(
            "[case] - scopes the %s query",
            async (method) => {
                // Arrange
                const { organization, a, b } = await suite.fixtures().tree();
                const foreign = await suite.fixtures().createOrganization();
                const queries = new DepartmentQueries(suite.repository());
                const props = {
                    organization: organization.id,
                    realm: scope === "matching" ? organization.realm : foreign.realm,
                    view: ResponseViewType.COMPACT,
                    pagination,
                };

                const execute = (): Promise<
                    Entities.Department | [Entities.Department[], number] | Repositories.Department.Graph.Data
                > => {
                    switch (method) {
                        case "single":
                            return queries.findUnique({ ...props, department: b.id });
                        case "list":
                            return queries.findMany({ ...props, mode: QueryMode.DEFAULT, filters: {}, sort: {} });
                        case "lookup":
                            return queries.getLookupList({ ...props, term: "" });
                        case "ancestors":
                            return queries.findAncestors({ ...props, filters: {}, descendant: b.id });
                        case "descendants":
                            return queries.findDescendants({ ...props, filters: {}, ancestor: a.id });
                        case "graph":
                            return queries.getHierarchyGraph(props);
                        default:
                            throw new Error(`Unknown query: ${method}`);
                    }
                };
                const count = { single: 1, list: 5, lookup: 5, ancestors: 2, descendants: 4, graph: 5 }[method];

                // Act
                const result = execute();
                const value = method === "single" && scope === "foreign" ? undefined : await result;

                // Assert
                if (method === "single") {
                    if (scope === "foreign") {
                        await expect(result).rejects.toThrow();
                    } else {
                        expect(value).toMatchObject({ id: b.id });
                    }
                } else if (value && "nodes" in value) {
                    expect(value.nodes).toHaveLength(scope === "matching" ? count : 0);
                    expect(value.edges).toHaveLength(scope === "matching" ? 3 : 0);
                } else if (Array.isArray(value)) {
                    expect(value[0]).toHaveLength(scope === "matching" ? count : 0);
                    expect(value[1]).toBe(scope === "matching" ? count : 0);
                } else {
                    throw new Error("Expected a graph or paginated list");
                }
            },
        );
    });
});
