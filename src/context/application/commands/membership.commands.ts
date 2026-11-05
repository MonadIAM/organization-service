import { Inject, Injectable, Scope } from "@nestjs/common";

import { ActionType, EntityType, RealmTopicAction, KafkaTopic } from "~context/enums";
import { TRANSACTIONAL_SERVICE } from "~common/transaction-manager";
import { MEMBERSHIP_SERVICE } from "~context/domain/services";
import { CONSUMER_META } from "~context/constants";
import { Exception } from "~common/exceptions";

import { MembershipMapper } from "../mappers/membership.mapper";

@Injectable({ scope: Scope.DEFAULT })
export class MembershipCommands implements Commands.Membership.Contract {
    private readonly mapper: Commands.Mappers.Membership.Contract;
    private readonly dictionaryPath = "commands.membership";
    private readonly resource = "Membership";

    public constructor(
        @Inject(TRANSACTIONAL_SERVICE)
        private readonly transactionalService: TransactionManager.Service.PublicContract,
        @Inject(MEMBERSHIP_SERVICE)
        private readonly membershipService: Services.Membership.CommandContract,
    ) {
        this.mapper = new MembershipMapper();
    }

    public async ensure(props: Commands.Membership.Ensure.Props): Commands.Membership.Ensure.Result {
        const { incoming, ...request } = props;

        try {
            await this.transactionalService.consume<Commands.Mappers.Membership.Ensure>({
                incoming,
                resource: this.resource,
                outbox: [
                    {
                        payloadMapper: this.mapper.ensureConfirmed,
                        actionType: RealmTopicAction.MEMBERSHIP_ENSURE_CONFIRMED,
                        destinationTopic: KafkaTopic.REALM,
                    },
                    {
                        payloadMapper: this.mapper.ensureJoin,
                        actionType: RealmTopicAction.MEMBERSHIP_JOIN_REQUESTED,
                        destinationTopic: KafkaTopic.REALM,
                    },
                ],
                audit: {
                    entityType: EntityType.MEMBERSHIP,
                    actionType: ActionType.CREATE,
                    context: CONSUMER_META,
                    ...request,
                },
                changeLog: true,
                execute: async (transaction) => {
                    const membership = await this.membershipService.ensure({ ...request, transaction });

                    return { membership, request };
                },
            });
        } catch (error) {
            if (!(error instanceof Exception) || Boolean(Exception.isRetryable(error))) {
                throw error;
            } else {
                await this.rejectEnsure({ incoming, request, reason: error.message });
            }
        }
    }

    public async completeEnsure(
        props: Commands.Membership.CompleteEnsure.Props,
    ): Commands.Membership.CompleteEnsure.Result {
        const { incoming, ...request } = props;

        await this.transactionalService.consume<Commands.Mappers.Membership.Ensure>({
            incoming,
            resource: this.resource,
            outbox: [
                {
                    payloadMapper: this.mapper.ensureConfirmed,
                    actionType: RealmTopicAction.MEMBERSHIP_ENSURE_CONFIRMED,
                    destinationTopic: KafkaTopic.REALM,
                },
                {
                    payloadMapper: this.mapper.ensureRejected,
                    actionType: RealmTopicAction.MEMBERSHIP_ENSURE_REJECTED,
                    destinationTopic: KafkaTopic.REALM,
                },
            ],
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.UPDATE,
                context: CONSUMER_META,
                ...request,
            },
            changeLog: true,
            execute: async (transaction) => {
                const membership = await this.membershipService.completeEnsure({ ...request, transaction });

                return {
                    reason: "reason" in request.input ? request.input.reason : undefined,
                    membership,
                    request: {
                        actor: request.actor,
                        realm: request.realm,
                        input: {
                            organization: membership.organization.id,
                            process: request.input.hrRequest!,
                            account: request.input.account,
                        },
                    },
                };
            },
        });
    }

    public async rejectEnsure(props: Commands.Membership.RejectEnsure.Props): Commands.Membership.RejectEnsure.Result {
        const { incoming, ...result } = props;

        await this.transactionalService.consume({
            incoming,
            resource: this.resource,
            payload: this.mapper.ensureRejected(result)[0],
            actionType: RealmTopicAction.MEMBERSHIP_ENSURE_REJECTED,
            destinationTopic: KafkaTopic.REALM,
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.CREATE,
                actor: result.request.actor,
                realm: result.request.realm,
                context: CONSUMER_META,
                input: result,
            },
        });
    }

    public async completeLeave(props: Commands.Membership.CompleteLeave.Props): Commands.Membership.CompleteLeave.Result {
        const { incoming, ...request } = props;

        try {
            await this.transactionalService.consume<Commands.Mappers.Membership.Leave>({
                incoming,
                resource: this.resource,
                outbox: [
                    {
                        payloadMapper: this.mapper.accessPayload,
                        actionType: RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                        destinationTopic: KafkaTopic.REALM,
                    },
                    {
                        payloadMapper: this.mapper.leaveConfirmed,
                        actionType: RealmTopicAction.MEMBERSHIP_LEAVE_CONFIRMED,
                        destinationTopic: KafkaTopic.REALM,
                    },
                ],
                audit: {
                    entityType: EntityType.MEMBERSHIP,
                    actionType: ActionType.LEAVE,
                    context: CONSUMER_META,
                    ...request,
                },
                changeLog: true,
                execute: async (transaction) => {
                    const result = await this.membershipService.completeLeave({ ...request, transaction });

                    return { ...result, actor: request.actor, request };
                },
            });
        } catch (error) {
            if (!(error instanceof Exception) || Boolean(Exception.isRetryable(error))) {
                throw error;
            } else {
                await this.rejectLeave({ incoming, request, reason: error.message });
            }
        }
    }

    public async rejectLeave(props: Commands.Membership.RejectLeave.Props): Commands.Membership.RejectLeave.Result {
        const { incoming, ...result } = props;

        await this.transactionalService.consume({
            incoming,
            resource: this.resource,
            payload: this.mapper.leaveRejected(result),
            actionType: RealmTopicAction.MEMBERSHIP_LEAVE_REJECTED,
            destinationTopic: KafkaTopic.REALM,
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.LEAVE,
                actor: result.request.actor,
                realm: result.request.realm,
                context: CONSUMER_META,
                input: result,
            },
        });
    }

    public async join(props: Commands.Membership.Join.Props): Commands.Membership.Join.Result {
        const { input, actor, realm } = props;

        await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                payloadMapper: this.mapper.joinPayload,
                actionType: RealmTopicAction.MEMBERSHIP_JOIN_REQUESTED,
                destinationTopic: KafkaTopic.REALM,
            },
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.CREATE,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                const membership = await this.membershipService.join({ input, transaction, realm });

                return { membership, actor };
            },
        });

        return { message: `${this.dictionaryPath}.JOIN_REQUESTED` };
    }

    public async suspend(props: Commands.Membership.Suspend.Props): Commands.Membership.Suspend.Result {
        const { input, realm, actor } = props;

        const { memberships } = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                payloadMapper: this.mapper.accessPayload,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_REVOKE,
                destinationTopic: KafkaTopic.REALM,
            },
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.SUSPEND,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                const result = await this.membershipService.suspend({ identifiers: input.identifiers, transaction, realm });

                return { ...result, actor };
            },
        });

        if (memberships.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_SUSPENDED_COUNT`, params: { count: memberships.length } };
        } else {
            return { message: `${this.dictionaryPath}.SUSPENDED` };
        }
    }

    public async resume(props: Commands.Membership.Resume.Props): Commands.Membership.Resume.Result {
        const { input, realm, actor } = props;

        const { memberships } = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                payloadMapper: this.mapper.accessPayload,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_RESTORE,
                destinationTopic: KafkaTopic.REALM,
            },
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.RESUME,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                const result = await this.membershipService.resume({ identifiers: input.identifiers, transaction, realm });

                return { ...result, actor };
            },
        });

        if (memberships.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_RESUMED_COUNT`, params: { count: memberships.length } };
        } else {
            return { message: `${this.dictionaryPath}.RESUMED` };
        }
    }

    public async leave(props: Commands.Membership.Leave.Props): Commands.Membership.Leave.Result {
        const { input, actor, realm } = props;

        const { memberships } = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                payloadMapper: this.mapper.accessPayload,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                destinationTopic: KafkaTopic.REALM,
            },
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.LEAVE,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                const result = await this.membershipService.leave({
                    identifiers: input.identifiers,
                    account: actor,
                    transaction,
                    realm,
                });

                return { ...result, actor };
            },
        });

        if (memberships.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_LEFT_COUNT`, params: { count: memberships.length } };
        } else {
            return { message: `${this.dictionaryPath}.LEFT` };
        }
    }

    public async block(props: Commands.Membership.Block.Props): Commands.Membership.Block.Result {
        const { input, realm, actor } = props;

        const { memberships } = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                payloadMapper: this.mapper.accessPayload,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                destinationTopic: KafkaTopic.REALM,
            },
            audit: {
                entityType: EntityType.MEMBERSHIP,
                actionType: ActionType.BLOCK,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                const result = await this.membershipService.block({
                    identifiers: input.identifiers,
                    transaction,
                    realm,
                });

                return { ...result, actor };
            },
        });

        if (memberships.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_BLOCKED_COUNT`, params: { count: memberships.length } };
        } else {
            return { message: `${this.dictionaryPath}.BLOCKED` };
        }
    }
}
