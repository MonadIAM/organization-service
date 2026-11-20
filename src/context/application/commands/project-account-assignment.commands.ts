import { Inject, Injectable, Scope } from "@nestjs/common";

import { ActionType, EntityType, KafkaTopic, RealmTopicAction } from "~context/enums";
import { PROJECT_ACCOUNT_ASSIGNMENT_SERVICE } from "~context/domain/services";
import { TRANSACTIONAL_SERVICE } from "~common/transaction-manager";

import { ProjectAccountAssignmentMapper } from "../mappers/project-account-assignment.mapper";

@Injectable({ scope: Scope.DEFAULT })
export class ProjectAccountAssignmentCommands implements Commands.ProjectAccountAssignment.Contract {
    private readonly mapper = new ProjectAccountAssignmentMapper();
    private readonly dictionaryPath = "commands.project-account-assignment";
    private readonly resource = "ProjectAccountAssignment";

    public constructor(
        @Inject(TRANSACTIONAL_SERVICE)
        private readonly transactionalService: TransactionManager.Service.PublicContract,
        @Inject(PROJECT_ACCOUNT_ASSIGNMENT_SERVICE)
        private readonly assignmentService: Services.ProjectAccountAssignment.CommandContract,
    ) {}

    public async create(
        props: Commands.ProjectAccountAssignment.Create.Props,
    ): Commands.ProjectAccountAssignment.Create.Result {
        const { input, actor, realm } = props;

        await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                destinationTopic: KafkaTopic.REALM,
                actionType: RealmTopicAction.MEMBERSHIP_JOIN_REQUESTED,
                payloadMapper: (assignment: Entities.ProjectAccountAssignment) => this.mapper.join(assignment, actor),
            },
            audit: {
                actionType: ActionType.CREATE,
                entityType: EntityType.PROJECT_ACCOUNT_ASSIGNMENT,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                return await this.assignmentService.create({ input, transaction, actor, realm });
            },
        });

        return { message: `${this.dictionaryPath}.CREATED` };
    }

    public async revoke(
        props: Commands.ProjectAccountAssignment.Revoke.Props,
    ): Commands.ProjectAccountAssignment.Revoke.Result {
        const { input, realm } = props;

        const assignments = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                destinationTopic: KafkaTopic.REALM,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_REVOKE,
                payloadMapper: (assignments: Entities.ProjectAccountAssignment[]) =>
                    this.mapper.access(assignments, props.actor),
            },
            audit: {
                actionType: ActionType.REVOKE,
                entityType: EntityType.PROJECT_ACCOUNT_ASSIGNMENT,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                return await this.assignmentService.revoke({ identifiers: input.identifiers, transaction, realm });
            },
        });

        if (assignments.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_REVOKED_COUNT`, params: { count: assignments.length } };
        } else {
            return { message: `${this.dictionaryPath}.REVOKED` };
        }
    }

    public async restore(
        props: Commands.ProjectAccountAssignment.Restore.Props,
    ): Commands.ProjectAccountAssignment.Restore.Result {
        const { input, realm } = props;

        const assignments = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                destinationTopic: KafkaTopic.REALM,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_RESTORE,
                payloadMapper: (assignments: Entities.ProjectAccountAssignment[]) =>
                    this.mapper.access(assignments, props.actor),
            },
            audit: {
                actionType: ActionType.RESTORE,
                entityType: EntityType.PROJECT_ACCOUNT_ASSIGNMENT,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                return await this.assignmentService.restore({ identifiers: input.identifiers, transaction, realm });
            },
        });

        if (assignments.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_RESTORED_COUNT`, params: { count: assignments.length } };
        } else {
            return { message: `${this.dictionaryPath}.RESTORED` };
        }
    }

    public async purge(
        props: Commands.ProjectAccountAssignment.Purge.Props,
    ): Commands.ProjectAccountAssignment.Purge.Result {
        const { input, realm } = props;

        const assignments = await this.transactionalService.run({
            resource: this.resource,
            outbox: {
                destinationTopic: KafkaTopic.REALM,
                actionType: RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                payloadMapper: (assignments: Entities.ProjectAccountAssignment[]) =>
                    this.mapper.access(assignments, props.actor),
            },
            audit: {
                actionType: ActionType.DELETE,
                entityType: EntityType.PROJECT_ACCOUNT_ASSIGNMENT,
                ...props,
            },
            changeLog: true,
            execute: async (transaction) => {
                return await this.assignmentService.purge({ identifiers: input.identifiers, transaction, realm });
            },
        });

        if (assignments.length > 1) {
            return { message: `${this.dictionaryPath}.BULK_PURGED_COUNT`, params: { count: assignments.length } };
        } else {
            return { message: `${this.dictionaryPath}.PURGED` };
        }
    }
}
