import { ProjectStatus } from "~context/enums";

declare global {
    namespace Entities {
        type Project = Project.Contract;

        namespace Project {
            interface Contract {
                id: string;
                createdAt: Date;
                updatedAt?: Date;
                archivedAt?: Date;
                version: number;
                process?: string;
                failure?: string;

                status: ProjectStatus;
                description: string;
                realm: string;
                name: string;

                manager?: Entities.ProjectAccountAssignment;
                organization: Entities.Organization;

                assignments: ORM.Collection<Entities.ProjectAccountAssignment>;

                assignManager(props: AssignManager.Props): void;
                rejectBootstrap(reason: string): void;
                update(props: ChangeDataProps): void;
                confirmBootstrap(): void;
                unassignManager(): void;
                beginBootstrap(): void;
                assertReady(): void;
                canPurge(): void;
                restore(): void;
                archive(): void;
            }

            type ConstructorProps = {
                organization: Entities.Organization;
                realm: string;
                description: string;
                name: string;
            };

            namespace AssignManager {
                type Props = {
                    assignment: Entities.ProjectAccountAssignment;
                };
            }

            type MutableFields = Pick<Contract, "name" | "description">;

            type ChangeDataProps = {
                patch: Partial<MutableFields>;
            };
        }
    }
}
