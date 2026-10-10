import { DepartmentStatus } from "~context/enums";

declare global {
    namespace Entities {
        type Department = Department.Contract;

        namespace Department {
            interface Contract {
                id: string;
                createdAt: Date;
                updatedAt?: Date;
                archivedAt?: Date;
                version: number;

                status: DepartmentStatus;
                description: string;
                name: string;

                managerPosition?: string;
                previousPosition?: string;
                process?: string;
                organization: Entities.Organization;

                assignManager(props: AssignManager.Props): void;
                releasePosition(positions: string[]): void;
                completePosition(rejected: boolean): void;
                update(props: ChangeDataProps): void;
                unassignManager(): void;
                assertReady(): void;
                canPurge(): void;
                restore(): void;
                archive(): void;
            }

            type ConstructorProps = {
                organization: Entities.Organization;
                description: string;
                name: string;
            };

            namespace AssignManager {
                type Props = {
                    position: string;
                };
            }

            type MutableFields = Pick<Contract, "name" | "description">;

            type ChangeDataProps = {
                patch: Partial<MutableFields>;
            };
        }
    }
}
