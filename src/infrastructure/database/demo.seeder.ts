import { dataset } from "@monadiam/shared/datasets/demo/organization";
import { Seeder } from "@mikro-orm/seeder";

export class Demo extends Seeder {
    private readonly schema: string = "organization";

    public async run(entityManager: ORM.EntityManager): Promise<void> {
        const seedOrder = [
            dataset.Organizations,
            dataset.Memberships,
            dataset.Departments,
            dataset.DepartmentClosures,
            dataset.Teams,
            dataset.Invites,
        ];

        await entityManager.transactional(async (manager) => {
            await manager.execute(`
                TRUNCATE TABLE
                    organization.organization,
                    organization.membership,
                    organization.department,
                    organization.department_closure,
                    organization.team,
                    organization.project,
                    organization.project_account_assignment,
                    organization.invite,
                    system.outbox,
                    system.change_log,
                    system.audit_log
                RESTART IDENTITY CASCADE
            `);

            await this.insertTables(manager, seedOrder);
            await this.seedProjects(manager);
        });
    }

    private async seedProjects(manager: ORM.EntityManager): Promise<void> {
        const projectsWithoutManagers = dataset.Projects.postgresql.map((project) => ({ ...project, manager_id: null }));

        await this.insertTables(manager, [
            { name: dataset.Projects.name, postgresql: projectsWithoutManagers },
            dataset.ProjectAccountAssignments,
        ]);

        for await (const project of dataset.Projects.postgresql) {
            await manager.execute("UPDATE organization.project SET manager_id = ? WHERE id = ?", [
                project.manager_id,
                project.id,
            ]);
        }
    }

    private async insertTables(
        manager: ORM.EntityManager,
        tables: { name: string; postgresql: Record<string, unknown>[] }[],
    ): Promise<void> {
        const platform = manager.getPlatform();
        const populatedTables = tables.filter((table) => table.postgresql.length > 0);

        for await (const table of populatedTables) {
            const query = platform.createNativeQueryBuilder().into(`${this.schema}.${table.name}`).insert(table.postgresql);
            await manager.execute(query, [], "run");
        }
    }
}
