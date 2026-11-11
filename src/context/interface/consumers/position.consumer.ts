import { EventPattern, Payload, Ctx } from "@nestjs/microservices";
import { Controller, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { PositionTopicAction } from "@monadiam/shared";
import { lastValueFrom } from "rxjs";

import {
    KAFKA_RETRY_SERVICE,
    KAFKA_SCHEMA_REGISTRY,
    KAFKA_SERVICE,
    KafkaIncomingMapper,
    KafkaClient,
    KafkaContext,
} from "~infrastructure/kafka";
import { POSITION_COMMANDS } from "~context/application/commands/tokens";
import { KAFKA_METRICS_RECORDER } from "~observability/metrics/tokens";
import { KafkaTopic } from "~context/enums";

@Controller()
export class PositionConsumer implements Consumers.Position.Contract, OnModuleInit {
    private readonly logger = new Logger(PositionConsumer.name);
    private readonly incomingMapper = new KafkaIncomingMapper();
    private readonly consumerKey = "organization.position.v1";

    public constructor(
        @Inject(POSITION_COMMANDS)
        private readonly positionCommands: Commands.Position.ConsumerContract,
        @Inject(KAFKA_METRICS_RECORDER)
        private readonly kafkaMetrics: Observability.Metrics.Kafka.PublicContract,
        @Inject(KAFKA_SCHEMA_REGISTRY)
        private readonly schemaRegistry: Kafka.SchemaRegistry.PublicContract,
        @Inject(KAFKA_RETRY_SERVICE)
        private readonly kafkaRetry: Kafka.Retry.Contract,
        @Inject(KAFKA_SERVICE)
        private readonly kafkaClient: KafkaClient,
    ) {}

    public async onModuleInit(): Promise<void> {
        await this.kafkaClient.connect();
    }

    @EventPattern(KafkaTopic.POSITION)
    public async handle(
        @Payload() message: Consumers.Position.Message,
        @Ctx() context: KafkaContext,
    ): Consumers.Position.Handle.Result {
        const incoming = {
            consumerKey: this.consumerKey,
            event: this.incomingMapper.reference({ context }),
        };
        await this.kafkaRetry.execute({
            topic: KafkaTopic.POSITION,
            heartbeat: context.getHeartbeat(),
            process: () => {
                return this.process({
                    incoming: this.incomingMapper.map({ consumerKey: this.consumerKey, context }),
                    message,
                });
            },
            reject: (error) => {
                return this.reject({ incoming, message, error });
            },
        });
    }

    public async process(props: Consumers.Position.Process.Props): Consumers.Position.Process.Result {
        const { incoming } = props;
        const message = await this.schemaRegistry.decode<Consumers.Position.Message>({
            topic: KafkaTopic.POSITION,
            value: props.message,
        });
        this.schemaRegistry.validate({ topic: KafkaTopic.POSITION, value: message });
        switch (message.actionType) {
            case PositionTopicAction.PLACEMENT_REQUESTED:
                await this.positionCommands.validatePlacement({ incoming, ...message.payload });
                break;
            case PositionTopicAction.REFERENCE_CONFIRMED:
                await this.positionCommands.completeReference({ incoming, ...message.payload, rejected: false });
                break;
            case PositionTopicAction.REFERENCE_REJECTED:
                await this.positionCommands.completeReference({ incoming, ...message.payload, rejected: true });
                break;
            case PositionTopicAction.ARCHIVED:
            case PositionTopicAction.PURGED:
                await this.positionCommands.release({ incoming, ...message.payload });
                break;
            default:
                break;
        }
    }

    public async reject(props: Consumers.Position.Reject.Props): Consumers.Position.Reject.Result {
        const { incoming, message, error } = props;
        this.logger.warn(`Rejected position event: ${String(error)}`);

        let decoded: Optional<Consumers.Position.Message>;
        try {
            decoded = await this.schemaRegistry.decode<Consumers.Position.Message>({
                topic: KafkaTopic.POSITION,
                value: message,
            });
            this.schemaRegistry.validate({ topic: KafkaTopic.POSITION, value: decoded });
        } catch {
            decoded = undefined;
        }

        if (decoded?.actionType === PositionTopicAction.PLACEMENT_REQUESTED) {
            await this.positionCommands.rejectPlacement({ incoming, request: decoded.payload, reason: String(error) });
        }

        await lastValueFrom(
            this.kafkaClient.emit(KafkaTopic.POSITION_DEAD, {
                key: incoming.event,
                value: { originalTopic: KafkaTopic.POSITION, error: String(error), payload: message },
            }),
        );

        this.kafkaMetrics.recordDead({ topic: KafkaTopic.POSITION, error });
    }
}
