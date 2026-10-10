import { InviteStatus } from "~context/enums";

declare global {
    namespace Entities {
        type Invite = Invite.Contract;

        namespace Invite {
            interface Contract {
                id: string;
                createdAt: Date;
                updatedAt?: Date;
                expiresAt?: Date;
                version: number;
                process?: string;
                failure?: string;

                organization: Entities.Organization;
                status: InviteStatus;
                invitee: string;
                inviter: string;
                role?: string;

                beginAccept(process: string): void;
                rejectAccept(reason: string): void;
                invalidate(at?: Date): void;
                decline(at?: Date): void;
                cancel(at?: Date): void;
                accept(at?: Date): void;
                expire(at?: Date): void;
                confirmAccept(): void;
            }

            type ConstructorProps = {
                organization: Entities.Organization;
                expiresAt?: Date;
                invitee: string;
                inviter: string;
                role?: string;
            };
        }
    }
}
