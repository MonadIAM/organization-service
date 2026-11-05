import { EventPattern, KafkaContext, Payload, ClientKafka, Ctx } from "@nestjs/microservices";
import { Controller, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { RealmTopicAction, RealmType } from "@monadiam/shared";
import { lastValueFrom } from "rxjs";

import { KAFKA_RETRY_SERVICE, KAFKA_SCHEMA_REGISTRY, KAFKA_SERVICE, KafkaIncomingMapper } from "~infrastructure/kafka";
import { KAFKA_METRICS_RECORDER } from "~observability/metrics/tokens";
import { KafkaTopic } from "~context/enums";
import {
    ORGANIZATION_COMMANDS,
    MEMBERSHIP_COMMANDS,
    PROJECT_COMMANDS,
    INVITE_COMMANDS,
} from "~context/application/commands/tokens";

@Controller()
export class RealmConsumer implements OnModuleInit, Consumers.Realm.Contract {
    private readonly incomingMapper = new KafkaIncomingMapper();
    private readonly logger = new Logger(RealmConsumer.name);
    private readonly consumerKey = "organization.realm.v1";

    public constructor(
        @Inject(ORGANIZATION_COMMANDS)
        private readonly organizationCommands: Commands.Organization.ConsumerContract,
        @Inject(MEMBERSHIP_COMMANDS)
        private readonly membershipCommands: Commands.Membership.ConsumerContract,
        @Inject(PROJECT_COMMANDS)
        private readonly projectCommands: Commands.Project.ConsumerContract,
        @Inject(INVITE_COMMANDS)
        private readonly inviteCommands: Commands.Invite.ConsumerContract,
        @Inject(KAFKA_METRICS_RECORDER)
        private readonly kafkaMetrics: Observability.Metrics.Kafka.PublicContract,
        @Inject(KAFKA_SCHEMA_REGISTRY)
        private readonly schemaRegistry: Kafka.SchemaRegistry.PublicContract,
        @Inject(KAFKA_RETRY_SERVICE)
        private readonly kafkaRetry: Kafka.Retry.Contract,
        @Inject(KAFKA_SERVICE)
        private readonly kafkaClient: ClientKafka,
    ) {}

    public async onModuleInit(): Promise<void> {
        await this.kafkaClient.connect();
    }

    @EventPattern(KafkaTopic.REALM)
    public async handle(
        @Payload() message: Consumers.Realm.Message,
        @Ctx() context: KafkaContext,
    ): Consumers.Realm.Handle.Result {
        const incoming = {
            consumerKey: this.consumerKey,
            event: this.incomingMapper.reference({ context }),
        };
        await this.kafkaRetry.execute({
            topic: KafkaTopic.REALM,
            heartbeat: context.getHeartbeat(),
            process: () =>
                this.process({
                    incoming: this.incomingMapper.map({ consumerKey: this.consumerKey, context }),
                    message,
                }),
            reject: (error) => this.reject({ incoming, message, error }),
        });
    }

    public async process(props: Consumers.Realm.Process.Props): Consumers.Realm.Process.Result {
        const { incoming } = props;
        const message = await this.schemaRegistry.decode<Consumers.Realm.Message>({
            topic: KafkaTopic.REALM,
            value: props.message,
        });
        this.schemaRegistry.validate({ topic: KafkaTopic.REALM, value: message });
        switch (message.actionType) {
            case RealmTopicAction.MEMBERSHIP_ENSURE_REQUESTED:
                await this.membershipCommands.ensure({ incoming, ...message.payload });
                break;
            case RealmTopicAction.MEMBERSHIP_LEAVE_REQUESTED:
                await this.membershipCommands.completeLeave({ incoming, ...message.payload });
                break;
            case RealmTopicAction.MEMBERSHIP_JOIN_CONFIRMED:
                if (message.payload.input.hrRequest) {
                    await this.membershipCommands.completeEnsure({ incoming, ...message.payload });
                } else {
                    await this.inviteCommands.confirmJoin({ incoming, ...message.payload });
                }
                break;
            case RealmTopicAction.MEMBERSHIP_JOIN_REJECTED:
                if (message.payload.input.hrRequest) {
                    await this.membershipCommands.completeEnsure({ incoming, ...message.payload });
                } else {
                    await this.inviteCommands.rejectJoin({ incoming, ...message.payload });
                }
                break;
            case RealmTopicAction.BOOTSTRAP_CONFIRMED:
                if (message.payload.input.type === RealmType.ORGANIZATION) {
                    await this.organizationCommands.confirmBootstrap({ incoming, ...message.payload });
                } else {
                    await this.projectCommands.confirmBootstrap({ incoming, ...message.payload });
                }
                break;
            case RealmTopicAction.BOOTSTRAP_REJECTED:
                if (message.payload.input.type === RealmType.ORGANIZATION) {
                    await this.organizationCommands.rejectBootstrap({ incoming, ...message.payload });
                } else {
                    await this.projectCommands.rejectBootstrap({ incoming, ...message.payload });
                }
                break;
            case RealmTopicAction.TRANSFER_OWNERSHIP_CONFIRMED:
                await this.organizationCommands.confirmTransfer({ incoming, ...message.payload });
                break;
            case RealmTopicAction.TRANSFER_OWNERSHIP_REJECTED:
                await this.organizationCommands.rejectTransfer({ incoming, ...message.payload });
                break;
            default:
                break;
        }
    }

    public async reject(props: Consumers.Realm.Reject.Props): Consumers.Realm.Reject.Result {
        const { incoming, message, error } = props;
        this.logger.warn(`Rejected realm event: ${String(error)}`);

        const decoded = await this.schemaRegistry.decode<Consumers.Realm.Message>({
            topic: KafkaTopic.REALM,
            value: message,
        });

        this.schemaRegistry.validate({ topic: KafkaTopic.REALM, value: decoded });

        if (
            decoded.actionType === RealmTopicAction.MEMBERSHIP_ENSURE_REQUESTED ||
            ((decoded.actionType === RealmTopicAction.MEMBERSHIP_JOIN_CONFIRMED ||
                decoded.actionType === RealmTopicAction.MEMBERSHIP_JOIN_REJECTED) &&
                decoded.payload.input.hrRequest)
        ) {
            throw error;
        } else if (decoded.actionType === RealmTopicAction.MEMBERSHIP_LEAVE_REQUESTED) {
            await this.membershipCommands.rejectLeave({ incoming, request: decoded.payload, reason: String(error) });
        } else if (
            decoded.actionType === RealmTopicAction.BOOTSTRAP_CONFIRMED &&
            decoded.payload.input.type === RealmType.ORGANIZATION
        ) {
            await this.organizationCommands.rejectBootstrap({
                incoming,
                ...decoded.payload,
                input: {
                    ...decoded.payload.input,
                    reason: String(error),
                },
            });
        } else if (
            decoded.actionType === RealmTopicAction.BOOTSTRAP_REJECTED &&
            decoded.payload.input.type === RealmType.ORGANIZATION
        ) {
            throw error;
        }

        await lastValueFrom(
            this.kafkaClient.emit(KafkaTopic.REALM_DEAD, {
                key: incoming.event,
                value: { originalTopic: KafkaTopic.REALM, error: String(error), payload: message },
            }),
        );

        this.kafkaMetrics.recordDead({ topic: KafkaTopic.REALM, error });
    }
}
