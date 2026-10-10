import { AssignmentStatus } from "~context/enums";

declare global {
    namespace Entities {
        type ProjectAccountAssignment = ProjectAccountAssignment.Contract;

        namespace ProjectAccountAssignment {
            interface Contract {
                id: string;
                assignedAt: Date;
                updatedAt?: Date;
                version: number;

                organization: Entities.Organization;
                membership: Entities.Membership;
                project: Entities.Project;
                assignedBy: string;
                status: AssignmentStatus;

                canPurge(): void;
                restore(): void;
                revoke(): void;
            }

            type ConstructorProps = {
                membership: Entities.Membership;
                project: Entities.Project;
                assignedBy: string;
            };
        }
    }
}
