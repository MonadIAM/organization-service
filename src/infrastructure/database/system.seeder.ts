import { dataset } from "@monadiam/shared/datasets/system/organization";
import { Seeder } from "@mikro-orm/seeder";

export class System extends Seeder {
    private readonly schema: string = "organization";

    public async run(entityManager: ORM.EntityManager): Promise<void> {
        const platform = entityManager.getPlatform();
        const seedOrder = [
            dataset.Organizations,
            dataset.Memberships,
            dataset.Departments,
            dataset.DepartmentClosures,
            dataset.Teams,
            dataset.Projects,
            dataset.ProjectAccountAssignments,
            dataset.Invites,
        ].filter((table) => table.postgresql.length > 0);

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

            for await (const entry of seedOrder) {
                const query = platform
                    .createNativeQueryBuilder()
                    .into(`${this.schema}.${entry.name}`)
                    .insert(entry.postgresql);
                await manager.execute(query, [], "run");
            }
        });
    }
}
