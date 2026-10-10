import { TeamStatus } from "~context/enums";

declare global {
    namespace Entities {
        type Team = Team.Contract;

        namespace Team {
            interface Contract {
                id: string;
                createdAt: Date;
                updatedAt?: Date;
                archivedAt?: Date;
                version: number;

                previousPosition?: string;
                leadPosition?: string;
                description: string;
                status: TeamStatus;
                process?: string;
                name: string;

                organization: Entities.Organization;
                department: Entities.Department;

                releasePosition(positions: string[]): void;
                completePosition(rejected: boolean): void;
                assignLead(props: AssignLead.Props): void;
                update(props: ChangeDataProps): void;
                unassignLead(): void;
                assertReady(): void;
                canPurge(): void;
                restore(): void;
                archive(): void;
            }

            type ConstructorProps = {
                organization: Entities.Organization;
                department: Entities.Department;
                description: string;
                name: string;
            };

            namespace AssignLead {
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
