import { randomUUID } from "node:crypto";

import { Exception } from "~common/exceptions";
import { InviteStatus } from "~context/enums";

export class Invite implements Entities.Invite.Contract {
    private static readonly dictionaryPath = "entities.invite";

    public id: string;
    public createdAt: Date;
    public updatedAt?: Date;
    public expiresAt?: Date;
    public version: number = 1;
    public process?: string;
    public failure?: string;

    public organization: Entities.Organization;
    public invitee: string;
    public inviter: string;
    public role?: string;
    public status: InviteStatus;

    public constructor(props: Entities.Invite.ConstructorProps) {
        this.createdAt = new Date();
        this.id = randomUUID();

        this.status = InviteStatus.PENDING;
        this.organization = props.organization;
        this.expiresAt = props.expiresAt;
        this.invitee = props.invitee;
        this.inviter = props.inviter;
        this.role = props.role;
    }

    public accept(at: Date = new Date()): void {
        this.finishBeforeExpiration(InviteStatus.ACCEPTED, "ACCEPT", at);
    }

    public decline(at: Date = new Date()): void {
        this.finishBeforeExpiration(InviteStatus.DECLINED, "DECLINE", at);
    }

    public cancel(at: Date = new Date()): void {
        this.finishBeforeExpiration(InviteStatus.CANCELLED, "CANCEL", at);
    }

    public invalidate(at: Date = new Date()): void {
        this.finishBeforeExpiration(InviteStatus.INVALIDATED, "INVALIDATE", at);
    }

    public expire(at: Date = new Date()): void {
        if (this.status === InviteStatus.PENDING) {
            if (this.expiresAt && this.expiresAt.getTime() <= at.getTime()) {
                this.status = InviteStatus.EXPIRED;
                this.updatedAt = at;
            } else {
                throw Exception.invariantViolation({
                    messageKey: `${Invite.dictionaryPath}.CANNOT_EXPIRE_UNDUE`,
                });
            }
        } else {
            throw Exception.invariantViolation({
                messageKey: `${Invite.dictionaryPath}.CANNOT_EXPIRE_INACTIVE`,
            });
        }
    }

    private finishBeforeExpiration(status: InviteStatus, action: string, at: Date): void {
        if (this.status === InviteStatus.PENDING) {
            if (this.expiresAt ? this.expiresAt.getTime() > at.getTime() : true) {
                this.status = status;
                this.updatedAt = at;
            } else {
                throw Exception.invariantViolation({
                    messageKey: `${Invite.dictionaryPath}.CANNOT_${action}_EXPIRED`,
                });
            }
        } else {
            throw Exception.invariantViolation({
                messageKey: `${Invite.dictionaryPath}.CANNOT_${action}_INACTIVE`,
            });
        }
    }

    public beginAccept(process: string): void {
        this.accept();
        this.status = InviteStatus.ACCEPTING;
        this.process = process;
        this.failure = undefined;
    }

    public confirmAccept(): void {
        if (!this.process || this.status !== InviteStatus.ACCEPTING) {
            throw Exception.conflict({ messageKey: `${Invite.dictionaryPath}.OPERATION_CONFLICT` });
        } else {
            this.status = InviteStatus.ACCEPTED;
            this.process = undefined;
            this.updatedAt = new Date();
        }
    }

    public rejectAccept(reason: string): void {
        if (!this.process || this.status !== InviteStatus.ACCEPTING) {
            throw Exception.conflict({ messageKey: `${Invite.dictionaryPath}.OPERATION_CONFLICT` });
        } else {
            this.status =
                this.expiresAt && this.expiresAt.getTime() <= Date.now() ? InviteStatus.EXPIRED : InviteStatus.PENDING;
            this.process = undefined;
            this.failure = reason;
            this.updatedAt = new Date();
        }
    }
}
