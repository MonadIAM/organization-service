import { EventPattern, Payload, ClientKafka, Ctx, KafkaContext, KafkaRetriableException } from "@nestjs/microservices";
import { Controller, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { ProjectionScript, KafkaTopic } from "@monadiam/shared";
import { lastValueFrom } from "rxjs";

import { KAFKA_RETRY_SERVICE, KAFKA_SCHEMA_REGISTRY, KAFKA_SERVICE, KafkaIncomingMapper } from "~infrastructure/kafka";
import { ACCESS_CACHE_SERVICE } from "~context/infrastructure/services/tokens";
import { KAFKA_METRICS_RECORDER } from "~observability/metrics/tokens";

@Controller()
export class AccessCacheConsumer implements Consumers.AccessCache.Contract, OnModuleInit {
    private readonly incomingMapper = new KafkaIncomingMapper();
    private readonly logger = new Logger(AccessCacheConsumer.name);
    private readonly consumerKey = "organization.access-cache.v1";

    public constructor(
        @Inject(ACCESS_CACHE_SERVICE)
        private readonly accessCacheService: InfrastructureServices.AccessCache.PublicContract,
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

    @EventPattern(KafkaTopic.PROJECTION_JOURNAL)
    public async handle(
        @Payload() message: Consumers.AccessCache.Message,
        @Ctx() context: KafkaContext,
    ): Consumers.AccessCache.Handle.Result {
        const incoming = {
            consumerKey: this.consumerKey,
            event: this.incomingMapper.reference({ context }),
        };
        await this.kafkaRetry.execute({
            topic: KafkaTopic.PROJECTION_JOURNAL,
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

    public async process(props: Consumers.AccessCache.Process.Props): Consumers.AccessCache.Process.Result {
        const { source } = props.incoming;
        if (source) {
            const message = await this.schemaRegistry.decode<Consumers.AccessCache.Message>({
                topic: KafkaTopic.PROJECTION_JOURNAL,
                value: props.message,
            });
            this.schemaRegistry.validate({ topic: KafkaTopic.PROJECTION_JOURNAL, value: message });
            if (message.actionType === ProjectionScript.CHECKPOINT) {
                await this.accessCacheService.invalidate({
                    partition: source.partition,
                    payload: message.payload,
                    offset: source.offset,
                });
            }
        } else {
            throw new KafkaRetriableException("Kafka source metadata is missing");
        }
    }

    public async reject(props: Consumers.AccessCache.Reject.Props): Consumers.AccessCache.Reject.Result {
        const { incoming, message, error } = props;
        this.logger.warn(`Rejected message in access cache consumer: ${String(error)}`);

        await lastValueFrom(
            this.kafkaClient.emit(KafkaTopic.PROJECTION_JOURNAL_DEAD, {
                key: incoming.event,
                value: {
                    originalTopic: KafkaTopic.PROJECTION_JOURNAL,
                    error: String(error),
                    payload: message,
                },
            }),
        );

        this.kafkaMetrics.recordDead({ topic: KafkaTopic.PROJECTION_JOURNAL, error });
        throw error;
    }
}
