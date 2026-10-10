import { EventPattern, KafkaContext, Payload, ClientKafka, Ctx } from "@nestjs/microservices";
import { Controller, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { AccountTopicAction } from "@monadiam/shared";
import { lastValueFrom } from "rxjs";

import { KAFKA_RETRY_SERVICE, KAFKA_SCHEMA_REGISTRY, KAFKA_SERVICE, KafkaIncomingMapper } from "~infrastructure/kafka";
import { ACCOUNT_COMMANDS } from "~context/application/commands";
import { KAFKA_METRICS_RECORDER } from "~observability/metrics/tokens";
import { KafkaTopic } from "~context/enums";

@Controller()
export class AccountConsumer implements OnModuleInit, Consumers.Account.Contract {
    private readonly incomingMapper = new KafkaIncomingMapper();
    private readonly logger = new Logger(AccountConsumer.name);
    private readonly consumerKey = "organization.account.v1";

    public constructor(
        @Inject(ACCOUNT_COMMANDS)
        private readonly accountCommands: Commands.Account.ConsumerContract,
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

    @EventPattern(KafkaTopic.ACCOUNT)
    public async handle(
        @Payload() message: Consumers.Account.Message,
        @Ctx() context: KafkaContext,
    ): Consumers.Account.Handle.Result {
        const incoming = {
            consumerKey: this.consumerKey,
            event: this.incomingMapper.reference({ context }),
        };
        await this.kafkaRetry.execute({
            topic: KafkaTopic.ACCOUNT,
            heartbeat: context.getHeartbeat(),
            process: () =>
                this.process({
                    incoming: this.incomingMapper.map({ consumerKey: this.consumerKey, context }),
                    message,
                }),
            reject: (error) => this.reject({ incoming, message, error }),
        });
    }

    public async process(props: Consumers.Account.Process.Props): Consumers.Account.Process.Result {
        const { incoming } = props;
        const message = await this.schemaRegistry.decode<Consumers.Account.Message>({
            topic: KafkaTopic.ACCOUNT,
            value: props.message,
        });
        this.schemaRegistry.validate({ topic: KafkaTopic.ACCOUNT, value: message });
        switch (message.actionType) {
            case AccountTopicAction.PURGE:
                await this.accountCommands.purge({ incoming, account: message.payload.account });
                break;
            default:
                this.logger.warn(`Unknown account action type: ${message.actionType}`);
        }
    }

    public async reject(props: Consumers.Account.Reject.Props): Consumers.Account.Reject.Result {
        const { incoming, message, error } = props;
        this.logger.warn(`Rejected account event: ${String(error)}`);

        await lastValueFrom(
            this.kafkaClient.emit(KafkaTopic.ACCOUNT_DEAD, {
                key: incoming.event,
                value: { originalTopic: KafkaTopic.ACCOUNT, error: String(error), payload: message },
            }),
        );

        this.kafkaMetrics.recordDead({ topic: KafkaTopic.ACCOUNT, error });
    }
}
